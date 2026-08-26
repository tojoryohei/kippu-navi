package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"fmt"
	"strings"
)

type CalculationResult struct {
	Fare           int
	BarrierFreeFee int
	TotalEigyoKilo domain.DeciKilo
	FinalPath      []int
}

func (c *CalculationResult) TotalAmount() int {
	return c.Fare + c.BarrierFreeFee
}

type CalculateAmount struct {
	reg                     *fare.Registry
	addonReg                *fare.AddonRegistry
	trainSpecificCalc       *fare.TrainSpecificSectionCalculator
	specificFarePathMatcher *fare.PathMatcher
	adjustedFarePathMatcher *fare.PathMatcher
	graph                   graph.Graph
	zoneRoutes              ticketdomain.ZoneRoutes
}

func NewCalculateAmount(
	reg *fare.Registry,
	addonReg *fare.AddonRegistry,
	trainSpecificCalc *fare.TrainSpecificSectionCalculator,
	specificFarePathMatcher *fare.PathMatcher,
	adjustedFarePathMatcher *fare.PathMatcher,
	g graph.Graph,
	zoneRoutes ticketdomain.ZoneRoutes,
) *CalculateAmount {
	return &CalculateAmount{
		reg:                     reg,
		addonReg:                addonReg,
		trainSpecificCalc:       trainSpecificCalc,
		specificFarePathMatcher: specificFarePathMatcher,
		adjustedFarePathMatcher: adjustedFarePathMatcher,
		graph:                   g,
		zoneRoutes:              zoneRoutes,
	}
}

type routeSummary struct {
	edges          []*domain.Edge
	totalEigyo     domain.DeciKilo
	totalGisei     domain.DeciKilo
	hasTrunk       bool
	hasLocal       bool
	statsByCompany []companyStats
}

type companyStats struct {
	used     bool
	hasTrunk bool
	hasLocal bool
	eigyo    domain.DeciKilo
	gisei    domain.DeciKilo
}

func (u *CalculateAmount) analyzePath(path []int) (*routeSummary, error) {
	if len(path) < 2 {
		return nil, domain.ErrInvalidPath
	}

	summary := &routeSummary{
		edges:          make([]*domain.Edge, 0, len(path)-1),
		statsByCompany: make([]companyStats, domain.CompanyCount),
	}

	for i := 0; i < len(path)-1; i++ {
		fromID := path[i]
		toID := path[i+1]

		var edge *domain.Edge
		edges := u.graph.GetEdges(fromID)
		for j := range edges {
			if edges[j].ToID == toID {
				edge = &edges[j].Edge
				break
			}
		}
		if edge == nil {
			fromName := u.graph.GetName(fromID)
			toName := u.graph.GetName(toID)
			fmt.Printf("analyzePath Error: 経路が見つかりません: %s(%d) -> %s(%d)\n", fromName, fromID, toName, toID)
			return nil, fmt.Errorf("CalculateAmount: 経路が見つかりません: %s(%d) -> %s(%d)", fromName, fromID, toName, toID)
		}

		summary.edges = append(summary.edges, edge)
		summary.totalEigyo += edge.EigyoKilo
		summary.totalGisei += edge.GiseiKilo

		if edge.IsLocal {
			summary.hasLocal = true
		} else {
			summary.hasTrunk = true
		}

		cID := edge.Company
		if int(cID) < 0 || int(cID) >= len(summary.statsByCompany) {
			return nil, fmt.Errorf("analyzePath: %w: %d", domain.ErrUnknownCompany, cID)
		}
		summary.statsByCompany[cID].used = true
		summary.statsByCompany[cID].eigyo += edge.EigyoKilo
		summary.statsByCompany[cID].gisei += edge.GiseiKilo
		if edge.IsLocal {
			summary.statsByCompany[cID].hasLocal = true
		} else {
			summary.statsByCompany[cID].hasTrunk = true
		}
	}

	return summary, nil
}

func (u *CalculateAmount) Execute(path []int) (*CalculationResult, error) {
	if len(path) < 2 {
		return nil, fmt.Errorf("CalculateAmount.Execute: %w", domain.ErrInvalidPath)
	}

	// 特例運賃計算用の仮想経路を構築（北新地→大阪・塚本などの置換）
	farePath := u.buildFarePath(path)

	summary, err := u.analyzePath(farePath)
	if err != nil {
		fmt.Printf("CalculateAmount.Execute: analyzePath failed: %v\n", err)
		return nil, err
	}

	var totalFare int
	var barrierFreeFee int

	// バリアフリー加算
	if fare.IsAllBarrierFreeFeeApplicable(summary.edges) {
		barrierFreeFee = fare.CalculateBarrierFreeFee()
	}

	// 調整運賃チェック
	if u.adjustedFarePathMatcher != nil {
		if f, ok := u.adjustedFarePathMatcher.Search(path); ok {
			totalFare = f
		}
	}

	// 特定運賃チェック
	if totalFare == 0 && u.specificFarePathMatcher != nil {
		if f, ok := u.specificFarePathMatcher.Search(path); ok {
			totalFare = f
		}
	}

	if totalFare == 0 {
		// 電車特定区間
		isTrainSpecific := fare.IsAllTrainSpecificApplicable(summary.edges)
		if isTrainSpecific {
			params := ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeTrunkOnly, // ドメインルール: 電車特定区間は幹線のみ
				EigyoKilo: summary.totalEigyo,
				GiseiKilo: summary.totalGisei,
			}
			f, err := u.trainSpecificCalc.Calculate(params)
			if err != nil {
				return nil, fmt.Errorf("電車特定区間の運賃計算に失敗しました: %w", err)
			}
			totalFare = f
		} else {
			// 基本運賃 (複数会社を跨ぐ場合も含む)
			totalLineType, err := domain.DetermineLineType(summary.hasTrunk, summary.hasLocal)
			if err != nil {
				return nil, fmt.Errorf("CalculateAmount: 全区間のルート種別判定に失敗しました: %w", err)
			}

			components := make([]fare.JointFareComponent, 0, domain.CompanyCount)
			for i := 0; i < int(domain.CompanyCount); i++ {
				if !summary.statsByCompany[i].used {
					continue
				}
				compLineType, err := domain.DetermineLineType(summary.statsByCompany[i].hasTrunk, summary.statsByCompany[i].hasLocal)
				if err != nil {
					return nil, fmt.Errorf("CalculateAmount: 会社 %d のルート種別判定に失敗しました: %w", i, err)
				}
				components = append(components, fare.JointFareComponent{
					CompanyID: domain.CompanyID(i),
					LineType:  compLineType,
					EigyoKilo: summary.statsByCompany[i].eigyo,
					GiseiKilo: summary.statsByCompany[i].gisei,
				})
			}

			fareVal, err := fare.CalculateJointFare(u.reg, summary.totalEigyo, summary.totalGisei, totalLineType, components)
			if err != nil {
				return nil, fmt.Errorf("運賃の計算に失敗しました: %w", err)
			}
			totalFare = fareVal
		}
	}

	// 加算運賃の適用
	if u.addonReg != nil {
		addons := u.addonReg.GetApplicableAddons(path)
		for _, a := range addons {
			totalFare += a
		}
	}

	return &CalculationResult{
		Fare:           totalFare,
		BarrierFreeFee: barrierFreeFee,
		TotalEigyoKilo: summary.totalEigyo,
		FinalPath:      path, // 実経路をそのまま返す
	}, nil
}

func (u *CalculateAmount) buildFarePath(path []int) []int {
	if len(path) == 0 {
		return path
	}
	farePath := make([]int, 0, len(path)*2)

	for i := 0; i < len(path); i++ {
		id := path[i]
		name := u.graph.GetName(id)

		// 特定都区市内の判定
		if u.zoneRoutes != nil && (strings.HasSuffix(name, "市内") || strings.HasSuffix(name, "区内") || name == "東京山手線内") {
			if i+1 < len(path) {
				nextName := u.graph.GetName(path[i+1])
				if route := u.zoneRoutes.GetRoute(name, nextName); route != nil {
					for j, rName := range route {
						if j < len(route)-1 {
							if rID, ok := u.graph.GetID(rName); ok {
								farePath = append(farePath, rID)
							}
						}
					}
					continue
				}
			}
			if i > 0 {
				prevName := u.graph.GetName(path[i-1])
				if route := u.zoneRoutes.GetRoute(name, prevName); route != nil {
					for j := len(route) - 2; j >= 0; j-- {
						if rID, ok := u.graph.GetID(route[j]); ok {
							farePath = append(farePath, rID)
						}
					}
					continue
				}
			}
		}
		farePath = append(farePath, id)
	}

	return u.applyKitashinchiReplacement(farePath)
}

func (u *CalculateAmount) applyKitashinchiReplacement(path []int) []int {
	if len(path) < 6 {
		return path
	}

	expectedPath := []string{"北新地", "新福島", "海老江", "御幣島", "加島", "尼崎"}
	osakaPath := []string{"大阪", "塚本", "尼崎"}

	// 順方向チェック (北新地発)
	matchFwd := true
	for i, name := range expectedPath {
		actualName := u.graph.GetName(path[i])
		if actualName != name {
			matchFwd = false
			break
		}
	}
	fmt.Printf("Kitashinchi matchFwd: %v, pathLen: %d\n", matchFwd, len(path))
	if matchFwd {
		validDirection := false
		if len(path) == 6 {
			validDirection = true
		} else {
			nextStation := u.graph.GetName(path[6])
			if nextStation == "立花" || nextStation == "塚口" {
				validDirection = true
			}
		}
		if validDirection {
			newPath := make([]int, 0, len(path)-3)
			for _, name := range osakaPath {
				id, _ := u.graph.GetID(name)
				newPath = append(newPath, id)
			}
			newPath = append(newPath, path[6:]...)
			fmt.Printf("Kitashinchi replaced! newPath length: %d\n", len(newPath))
			return newPath
		} else {
			nextStation := ""
			if len(path) > 6 {
				nextStation = u.graph.GetName(path[6])
			}
			fmt.Printf("Kitashinchi validDirection false! nextStation: %s\n", nextStation)
		}
	}

	// 逆方向チェック (北新地着)
	matchRev := true
	n := len(path)
	for i, name := range expectedPath {
		if u.graph.GetName(path[n-1-i]) != name {
			matchRev = false
			break
		}
	}
	if matchRev {
		validDirection := false
		if len(path) == 6 {
			validDirection = true
		} else {
			prevStation := u.graph.GetName(path[n-7])
			if prevStation == "立花" || prevStation == "塚口" {
				validDirection = true
			}
		}
		if validDirection {
			newPath := make([]int, 0, len(path)-3)
			newPath = append(newPath, path[:n-6]...)
			idAmagasaki, _ := u.graph.GetID("尼崎")
			idTsukamoto, _ := u.graph.GetID("塚本")
			idOsaka, _ := u.graph.GetID("大阪")
			newPath = append(newPath, idAmagasaki, idTsukamoto, idOsaka)
			return newPath
		}
	}

	return path
}
