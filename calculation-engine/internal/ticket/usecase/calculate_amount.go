package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/fareio"
	"fmt"
)

type CalculationResult struct {
	Fare               int
	BarrierFreeFee     int
	TotalEigyoKilo     domain.DeciKilo // JRの合計（運賃計算用）
	TotalPathEigyoKilo domain.DeciKilo // 私鉄を含めた全経路の合計（有効日数計算用）
	FinalPath          []int
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
	privateFareReg          *fareio.PrivateFareRegistry
	graph                   graph.Graph
	zoneRoutes              ticketdomain.ZoneRoutes
	article70Routes         *ticketdomain.Article70Routes
}

func NewCalculateAmount(
	reg *fare.Registry,
	addonReg *fare.AddonRegistry,
	trainSpecificCalc *fare.TrainSpecificSectionCalculator,
	specificFarePathMatcher *fare.PathMatcher,
	adjustedFarePathMatcher *fare.PathMatcher,
	privateFareReg *fareio.PrivateFareRegistry,
	graph graph.Graph,
	zoneRoutes ticketdomain.ZoneRoutes,
	article70Routes *ticketdomain.Article70Routes,
) *CalculateAmount {
	return &CalculateAmount{
		reg:                     reg,
		addonReg:                addonReg,
		trainSpecificCalc:       trainSpecificCalc,
		specificFarePathMatcher: specificFarePathMatcher,
		adjustedFarePathMatcher: adjustedFarePathMatcher,
		privateFareReg:          privateFareReg,
		graph:                   graph,
		zoneRoutes:              zoneRoutes,
		article70Routes:         article70Routes,
	}
}

type routeSummary struct {
	edges          []*domain.Edge
	totalEigyo     domain.DeciKilo // JRの合計
	totalGisei     domain.DeciKilo // JRの合計
	totalPathEigyo domain.DeciKilo // JR・私鉄を含めた経路全体の営業キロ
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
			return nil, fmt.Errorf("CalculateAmount: 経路が見つかりません: %s(%d) -> %s(%d)", fromName, fromID, toName, toID)
		}

		summary.edges = append(summary.edges, edge)

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

		// JR・私鉄を問わず全経路の営業キロを合算
		summary.totalPathEigyo += edge.EigyoKilo

		// JRの距離のみを合計（CompanyID 0 は私鉄として除外）
		if cID != domain.Other {
			summary.totalEigyo += edge.EigyoKilo
			summary.totalGisei += edge.GiseiKilo

			if edge.IsLocal {
				summary.hasLocal = true
			} else {
				summary.hasTrunk = true
			}
		}
	}

	return summary, nil
}

// applyArticle70 は70条特例エリア（大都市近郊区間・太線区間）を通過または発着する際に、最短経路へ補正します。
func (u *CalculateAmount) applyArticle70(path []int) []int {
	if u.article70Routes == nil || len(path) < 2 {
		return path
	}

	// 太線セグメントを抽出
	type segment struct {
		startIdx int
		endIdx   int
	}
	var segments []segment

	inSegment := false
	startIdx := 0

	for i := 0; i < len(path)-1; i++ {
		edges := u.graph.GetEdges(path[i])
		var isBold bool
		for _, e := range edges {
			if e.ToID == path[i+1] && e.IsBoldLineArea {
				isBold = true
				break
			}
		}

		if isBold {
			if !inSegment {
				inSegment = true
				startIdx = i
			}
		} else {
			if inSegment {
				inSegment = false
				segments = append(segments, segment{startIdx, i})
			}
		}
	}
	if inSegment {
		segments = append(segments, segment{startIdx, len(path) - 1})
	}

	if len(segments) == 0 {
		return path
	}

	// 経路置換のために新しいスライスを作成（後ろから処理するとインデックスが狂いにくい）
	newPath := make([]int, len(path))
	copy(newPath, path)

	for i := len(segments) - 1; i >= 0; i-- {
		seg := segments[i]

		// エリア内完結（最初から最後まで）は補正しないルール
		if seg.startIdx == 0 && seg.endIdx == len(path)-1 {
			continue
		}

		mode := "passing"
		if seg.startIdx == 0 {
			mode = "from"
		} else if seg.endIdx == len(path)-1 {
			mode = "to"
		}

		startName := u.graph.GetName(path[seg.startIdx])
		endName := u.graph.GetName(path[seg.endIdx])

		routeNames := u.article70Routes.GetRoute(mode, startName, endName)
		if routeNames != nil {
			var routeIDs []int
			for _, name := range routeNames {
				if id, ok := u.graph.GetID(name); ok {
					routeIDs = append(routeIDs, id)
				} else {
					routeIDs = nil
					break
				}
			}

			if len(routeIDs) > 0 {
				if routeIDs[0] != path[seg.startIdx] {
					routeIDs = append([]int{path[seg.startIdx]}, routeIDs...)
				}
				if routeIDs[len(routeIDs)-1] != path[seg.endIdx] {
					routeIDs = append(routeIDs, path[seg.endIdx])
				}
				head := newPath[:seg.startIdx]
				tail := newPath[seg.endIdx+1:]
				merged := make([]int, 0, len(head)+len(routeIDs)+len(tail))
				merged = append(merged, head...)
				merged = append(merged, routeIDs...)
				merged = append(merged, tail...)
				newPath = merged
			}
		}
	}

	return newPath
}

func (u *CalculateAmount) Execute(path []int) (*CalculationResult, error) {
	if len(path) < 2 {
		return nil, fmt.Errorf("CalculateAmount.Execute: %w", domain.ErrInvalidPath)
	}

	// 特例運賃計算用の仮想経路を構築（北新地→大阪・塚本などの置換）
	farePath := u.buildFarePath(path)

	// 70条特例の補正
	farePath = u.applyArticle70(farePath)

	summary, err := u.analyzePath(farePath)
	if err != nil {
		return nil, err
	}

	var totalFare int
	var barrierFreeFee int

	// JRの区間のみを抽出 (他会社線と連絡する場合はJRのみで判定)
	var jrEdges []*domain.Edge
	for _, edge := range summary.edges {
		if edge.Company != domain.Other {
			jrEdges = append(jrEdges, edge)
		}
	}

	// バリアフリー加算
	if len(jrEdges) > 0 && fare.IsAllBarrierFreeFeeApplicable(jrEdges) {
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
		isTrainSpecific := len(jrEdges) > 0 && fare.IsAllTrainSpecificApplicable(jrEdges)
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
		} else if len(jrEdges) > 0 {
			// 基本運賃 (複数会社を跨ぐ場合も含む)
			var totalLineType domain.LineType
			var err error
			var hasTrunk, hasLocal bool
			for _, e := range jrEdges {
				if e.IsLocal {
					hasLocal = true
				} else {
					hasTrunk = true
				}
			}
			totalLineType, err = domain.DetermineLineType(hasTrunk, hasLocal)
			if err != nil {
				return nil, fmt.Errorf("CalculateAmount: 全JR区間のルート種別判定に失敗しました: %w", err)
			}

			components := make([]fare.JointFareComponent, 0, domain.CompanyCount)
			// JR各社（1〜6）のみを対象とする
			for i := 1; i < int(domain.CompanyCount); i++ {
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

	// 私鉄運賃の計算 (Company == 0 の区間)
	if u.privateFareReg != nil {
		var privateStartIdx = -1
		for i, edge := range summary.edges {
			if edge.Company == domain.Other {
				if privateStartIdx == -1 {
					privateStartIdx = i
				}
			} else {
				if privateStartIdx != -1 {
					startName := u.graph.GetName(farePath[privateStartIdx])
					endName := u.graph.GetName(farePath[i])
					if f, ok := u.privateFareReg.GetFare(startName, endName); ok {
						totalFare += f
					} else {
						return nil, fmt.Errorf("運賃が未登録です: %s - %s", startName, endName)
					}
					privateStartIdx = -1
				}
			}
		}
		if privateStartIdx != -1 {
			startName := u.graph.GetName(farePath[privateStartIdx])
			endName := u.graph.GetName(farePath[len(summary.edges)])
			if f, ok := u.privateFareReg.GetFare(startName, endName); ok {
				totalFare += f
			} else {
				return nil, fmt.Errorf("運賃が未登録です: %s - %s", startName, endName)
			}
		}
	}

	return &CalculationResult{
		Fare:               totalFare,
		BarrierFreeFee:     barrierFreeFee,
		TotalEigyoKilo:     summary.totalEigyo,
		TotalPathEigyoKilo: summary.totalPathEigyo,
		FinalPath:          path, // 実経路をそのまま返す
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

		// ゾーン名（特定都区市内や大阪・新大阪など）であるかどうかの判定
		// zoneRoutesにキーとして登録されていればゾーンとして扱う
		_, isZone := u.zoneRoutes[name]
		if u.zoneRoutes != nil && isZone {
			if i+1 < len(path) {
				nextName := u.graph.GetName(path[i+1])
				if route := u.zoneRoutes.GetRoute(name, nextName); route != nil {
					// 旅客営業規則: 東京都区内・東京山手線内から品川(出口)経由で新横浜へ向かう場合
					// 東京・品川間は東海道本線（新幹線）として計算する。
					// 東京→品川の直接辺は新幹線のみ存在するため、["東京","品川"]と展開するだけで自動的にJRCentral辺が選ばれる。
					if (name == "東京都区内" || name == "東京山手線内") && nextName == "品川" && i+2 < len(path) {
						if u.graph.GetName(path[i+2]) == "新横浜" {
							if tokyoID, ok := u.graph.GetID("東京"); ok {
								farePath = append(farePath, tokyoID)
								continue
							}
						}
					}
					// 通常のゾーンルート展開（最後の駅（出口駅）を除いた駅名を追加）
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
					// 旅客営業規則: 新横浜から品川(入口)経由で東京都区内・東京山手線内へ入る場合
					// 品川・東京間は東海道本線（新幹線）として計算する。
					// 品川→東京の直接辺は新幹線のみ存在するため、["品川","東京"]と展開するだけで自動的にJRCentral辺が選ばれる。
					if (name == "東京都区内" || name == "東京山手線内") && prevName == "品川" && i >= 2 {
						if u.graph.GetName(path[i-2]) == "新横浜" {
							if tokyoID, ok := u.graph.GetID("東京"); ok {
								farePath = append(farePath, tokyoID)
								continue
							}
						}
					}
					// 通常のゾーンルート展開（逆方向: 先頭の駅から颮list[1]まで追加）
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
			return newPath
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
