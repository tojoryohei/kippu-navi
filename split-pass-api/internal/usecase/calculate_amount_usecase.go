package usecase

import (
	"errors"
	"fmt"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph"
)

// CalculateAmountUseCase は経路から定期運賃を計算するユースケースです。
// グラフ、運賃レジストリ、特定区間加算運賃レジストリを協調させます。
type CalculateAmountUseCase struct {
	graph                    *graph.Graph
	reg                      *fare.Registry
	addonFareReg             *domain.AddonRegistry
	addonChargeReg           *domain.AddonRegistry
	trainSpecificCalc        *fare.TrainSpecificSectionCalculator
	specificFareRouteMatcher *fare.RouteMatcher
	adjustedFareRouteMatcher *fare.RouteMatcher
}

// NewCalculateAmountUseCase は新しい CalculateAmountUseCase を作成します。
func NewCalculateAmountUseCase(
	g *graph.Graph,
	reg *fare.Registry,
	addonFareReg *domain.AddonRegistry,
	addonChargeReg *domain.AddonRegistry,
	trainSpecificCalc *fare.TrainSpecificSectionCalculator,
	specificFareRouteMatcher *fare.RouteMatcher,
	adjustedFareRouteMatcher *fare.RouteMatcher,
) *CalculateAmountUseCase {
	return &CalculateAmountUseCase{
		graph:                    g,
		reg:                      reg,
		addonFareReg:             addonFareReg,
		addonChargeReg:           addonChargeReg,
		trainSpecificCalc:        trainSpecificCalc,
		specificFareRouteMatcher: specificFareRouteMatcher,
		adjustedFareRouteMatcher: adjustedFareRouteMatcher,
	}
}

type companyStats struct {
	used     bool
	eigyo    domain.DeciKilo
	gisei    domain.DeciKilo
	hasTrunk bool
	hasLocal bool
}

type routeSummary struct {
	edges          []*domain.Edge
	statsByCompany [int(domain.CompanyCount)]companyStats
	totalEigyo     domain.DeciKilo
	totalGisei     domain.DeciKilo
	hasTrunk       bool
	hasLocal       bool
}

// CalculationResult は、運賃と料金の計算結果の内訳を保持します。
type CalculationResult struct {
	Fare           int // 運賃（基本運賃＋加算運賃）
	BarrierFreeFee int // 鉄道バリアフリー料金
	Charge         int // 料金（博多南線などの特急料金等）
}

// TotalAmount は発売額（運賃と料金の総計）を動的に算出して返します。
func (r *CalculationResult) TotalAmount() int {
	return r.Fare + r.BarrierFreeFee + r.Charge
}

func (u *CalculateAmountUseCase) analyzeRoute(path []int) (*routeSummary, error) {
	summary := &routeSummary{
		edges: make([]*domain.Edge, 0, len(path)-1),
	}

	for i := 0; i < len(path)-1; i++ {
		fromID := path[i]
		toID := path[i+1]

		// エッジを検索
		var edge *domain.Edge
		for j := range u.graph.Edges[fromID] {
			if u.graph.Edges[fromID][j].ToID == toID {
				edge = &u.graph.Edges[fromID][j]
				break
			}
		}
		if edge == nil {
			return nil, fmt.Errorf("駅間に直接のエッジがありません: ID %d -> ID %d", fromID, toID)
		}
		summary.edges = append(summary.edges, edge)

		// 全体集計
		summary.totalEigyo += edge.EigyoKilo
		summary.totalGisei += edge.GiseiKilo
		if edge.IsLocal {
			summary.hasLocal = true
		} else {
			summary.hasTrunk = true
		}

		// 会社別集計
		cID := edge.Company
		if int(cID) < 0 || int(cID) >= len(summary.statsByCompany) {
			return nil, fmt.Errorf("未知の会社ID: %d", cID)
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

// Execute は経路（駅IDの配列）を入力として受け取り、正しい定期運賃を返します。
func (u *CalculateAmountUseCase) Execute(path []int, months int) (*CalculationResult, error) {
	if len(path) < 2 {
		return nil, errors.New("経路には少なくとも2つの駅が必要です")
	}

	// 経路情報の集計
	summary, err := u.analyzeRoute(path)
	if err != nil {
		return nil, err
	}

	var totalFare int
	var barrierFreeFee int
	var limitedExpressCharge int

	// 鉄道バリアフリー料金
	val, err := fare.CalculateBarrierFreeFee(months)
	if err != nil {
		return nil, fmt.Errorf("鉄道バリアフリー料金の計算に失敗しました: %w", err)
	}
	barrierFreeFee = val

	// 調整運賃のチェック
	if f, ok := u.adjustedFareRouteMatcher.Search(path); ok {
		val, err := f.GetByMonths(months)
		// 調整運賃が設定されていない月は、0が返る。
		if err != nil {
			return nil, fmt.Errorf("調整運賃の取得に失敗しました: %w", err)
		}
		if val > 0 {
			// ドメインルール: 調整運賃適用時は、バリアフリー料金が必ずかかり特急料金は発生しない
			return &CalculationResult{
				Fare:           val,
				BarrierFreeFee: barrierFreeFee,
				Charge:         0,
			}, nil
		}
	}

	// 鉄道バリアフリー料金の適用判定
	isBarrierFree := fare.IsAllBarrierFreeFeeApplicable(summary.edges)
	if !isBarrierFree {
		barrierFreeFee = 0
	}

	// 特例運賃チェック
	if f, ok := u.specificFareRouteMatcher.Search(path); ok {
		val, err := f.GetByMonths(months)
		if err != nil {
			return nil, fmt.Errorf("特例運賃の取得に失敗しました: %w", err)
		}
		// ドメインルール: 特例運賃適用時は、特急料金は発生しない
		return &CalculationResult{
			Fare:           val,
			BarrierFreeFee: barrierFreeFee,
			Charge:         0,
		}, nil
	}

	// 加算運賃の集計 (重複排除ロジックを使用)
	addonFares := u.addonFareReg.GetApplicableAddons(path)
	for _, addon := range addonFares {
		fareVal, err := addon.GetByMonths(months)
		if err != nil {
			return nil, fmt.Errorf("加算運賃の取得に失敗しました: %w", err)
		}
		totalFare += fareVal
	}

	// 電車特定区間の判定と計算
	isTrainSpecific := fare.IsAllTrainSpecificApplicable(summary.edges)
	if isTrainSpecific {
		params := domain.PassFareParams{
			RouteType: domain.RouteTypeTrunkOnly, // ドメインルール: 電車特定区間は幹線のみ
			EigyoKilo: summary.totalEigyo,
			GiseiKilo: summary.totalGisei,
			Months:    months,
		}
		fareVal, err := u.trainSpecificCalc.Calculate(params)
		if err != nil {
			return nil, fmt.Errorf("電車特定区間の運賃計算に失敗しました: %w", err)
		}
		// ドメインルール: 電車特定区間内は、JR西日本完結であり特急料金は発生しない
		totalFare += fareVal
		return &CalculationResult{
			Fare:           totalFare,
			BarrierFreeFee: barrierFreeFee,
			Charge:         0,
		}, nil
	}

	// 基本運賃の計算
	// 運賃計算パッケージ用のデータに変換
	totalRouteType, err := domain.DetermineRouteType(summary.hasTrunk, summary.hasLocal)
	if err != nil {
		return nil, fmt.Errorf("CalculateAmountUseCase: 全区間のルート種別判定に失敗しました: %w", err)
	}

	components := make([]fare.JointFareComponent, 0, domain.CompanyCount)
	for i := 0; i < int(domain.CompanyCount); i++ {
		if !summary.statsByCompany[i].used {
			continue
		}
		compRouteType, err := domain.DetermineRouteType(summary.statsByCompany[i].hasTrunk, summary.statsByCompany[i].hasLocal)
		if err != nil {
			return nil, fmt.Errorf("CalculateAmountUseCase: 会社 %d のルート種別判定に失敗しました: %w", i, err)
		}
		components = append(components, fare.JointFareComponent{
			CompanyID: domain.CompanyID(i),
			RouteType: compRouteType,
			EigyoKilo: summary.statsByCompany[i].eigyo,
			GiseiKilo: summary.statsByCompany[i].gisei,
		})
	}
	fareVal, err := fare.CalculateJointFare(u.reg, summary.totalEigyo, summary.totalGisei, totalRouteType, components, months)
	if err != nil {
		return nil, fmt.Errorf("会社跨ぎの加算額の計算に失敗しました: %w", err)
	}
	totalFare += fareVal

	// 特急料金の集計
	addonCharges := u.addonChargeReg.GetApplicableAddons(path)
	for _, addon := range addonCharges {
		chargeVal, err := addon.GetByMonths(months)
		if err != nil {
			return nil, fmt.Errorf("特急料金の取得に失敗しました: %w", err)
		}
		limitedExpressCharge += chargeVal
	}

	return &CalculationResult{
		Fare:           totalFare,
		BarrierFreeFee: barrierFreeFee,
		Charge:         limitedExpressCharge,
	}, nil
}
