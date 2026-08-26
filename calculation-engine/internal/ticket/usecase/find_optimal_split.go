package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"fmt"
)

// EvaluationResult は、運賃計算結果を抽象化するインターフェースです。
type EvaluationResult interface {
	TotalAmount() int
}

// RouteEvaluator は、指定された経路に対する運賃計算を行うインターフェースです。
type RouteEvaluator[T EvaluationResult] interface {
	Execute(path []int, months int) (T, error)
}

// TicketSegmentEvaluator は乗車券の分割区間を評価する実装です。
// ここで特例ゾーンの強制適用と距離によるロールバックの制御を行います。
type TicketSegmentEvaluator struct {
	calc         *CalculateAmount
	applier      *SpecialZoneApplier
	zoneRegistry *graphio.SpecialZoneRegistry
	graph        graph.Graph
}

// NewTicketSegmentEvaluator は新しい TicketSegmentEvaluator を作成します。
func NewTicketSegmentEvaluator(calc *CalculateAmount, applier *SpecialZoneApplier, reg *graphio.SpecialZoneRegistry, g graph.Graph) *TicketSegmentEvaluator {
	return &TicketSegmentEvaluator{
		calc:         calc,
		applier:      applier,
		zoneRegistry: reg,
		graph:        g,
	}
}

// Execute は与えられた物理経路に対して特例適用を試行し、最安（または適切な）運賃結果を返します。
// ※ months は定期券とのインターフェース互換用であり、乗車券では無視されます。
func (e *TicketSegmentEvaluator) Execute(path []int, months int) (*CalculationResult, error) {
	if len(path) < 2 {
		return nil, domain.ErrInvalidPath
	}

	startID := path[0]
	endID := path[len(path)-1]

	startName := e.graph.GetName(startID)
	endName := e.graph.GetName(endID)

	originZones := e.zoneRegistry.FindZonesByStation(startName)
	destZones := e.zoneRegistry.FindZonesByStation(endName)

	type zoneCandidate struct {
		origin *ticketdomain.SpecialZone
		dest   *ticketdomain.SpecialZone
	}

	var candidates []zoneCandidate

	// 両端適用の組み合わせ
	for i := range originZones {
		for j := range destZones {
			// 同一ゾーン発着は特例適用外（距離が200kmを超えないため）
			if originZones[i].Name != destZones[j].Name {
				candidates = append(candidates, zoneCandidate{origin: &originZones[i], dest: &destZones[j]})
			}
		}
	}
	// 出発のみ適用
	for i := range originZones {
		candidates = append(candidates, zoneCandidate{origin: &originZones[i], dest: nil})
	}
	// 到着のみ適用
	for j := range destZones {
		candidates = append(candidates, zoneCandidate{origin: nil, dest: &destZones[j]})
	}

	// 厳しい条件（リストの先頭）から順に試行する
	for _, cand := range candidates {
		appliedInfo, ok := e.applier.Apply(path, cand.origin, cand.dest)
		if ok {
			fmt.Printf("TicketSegmentEvaluator: appliedInfo.TransformedPath len=%d\n", len(appliedInfo.TransformedPath))
			// 特例が適用された仮想経路で運賃計算を試みる
			res, err := e.calc.Execute(appliedInfo.TransformedPath)
			if err == nil {
				// 合計営業キロが閾値を満たしているか確認
				fmt.Printf("TicketSegmentEvaluator: res.TotalEigyoKilo=%v, ThresholdKilo=%v\n", res.TotalEigyoKilo, appliedInfo.ThresholdKilo)
				if res.TotalEigyoKilo > appliedInfo.ThresholdKilo {
					return res, nil // 強制適用成功！
				}
			} else {
				fmt.Printf("TicketSegmentEvaluator: calc.Execute failed: %v\n", err)
			}
		}
	}

	// 第88条の特例（大阪・新大阪と姫路以遠）の適用を試行
	// 特定都区市内（大阪市内等）が適用されなかった場合（または距離閾値に満たなかった場合）に評価する
	if osakaInfo, ok := ApplyOsakaShinOsakaException(path, e.graph); ok {
		res, err := e.calc.Execute(osakaInfo.TransformedPath)
		if err == nil {
			return res, nil
		}
	}

	// すべての特例適用が失敗（または閾値未達）だった場合は、特例を適用せずに元の物理経路にロールバックして運賃計算
	return e.calc.Execute(path)
}

// EvaluatedSegment は、評価済みの区間の経路と結果を保持します。
type EvaluatedSegment[T EvaluationResult] struct {
	StationIDs []int
	Result     T
}

// OptimizedPath は、オプティマイザが算出した1つの経路分割パターンを保持します。
type OptimizedPath[T EvaluationResult] struct {
	TotalAmount int
	Segments    []EvaluatedSegment[T]
}

// SplitOptimizer は経路の最適分割を行うアルゴリズムのインターフェースです。
type SplitOptimizer[T EvaluationResult] interface {
	Optimize(path []int, months int, locked []bool, maxSections int) ([]OptimizedPath[T], error)
}

// SplitSegment は分割された個々の区間とその運賃計算結果を保持します。
type SplitSegment struct {
	Path           []int
	Result         *CalculationResult
	StartStationID int // 本来の利用区間の発駅ID
	EndStationID   int // 本来の利用区間の着駅ID
}

// SplitResult は最適な分割結果とその内訳を保持します。
type SplitResult struct {
	TotalAmount int
	Segments    []SplitSegment
}

// FindOptimalSplit は経路から分割乗車券の最安パターンを見つけるユースケースです。
type FindOptimalSplit struct {
	optimizer SplitOptimizer[*CalculationResult]
}

// NewFindOptimalSplit は新しい FindOptimalSplit を作成します。
func NewFindOptimalSplit(opt SplitOptimizer[*CalculationResult]) *FindOptimalSplit {
	return &FindOptimalSplit{
		optimizer: opt,
	}
}

// Execute は指定された経路の全分割パターンを評価し、最安となる分割結果をすべて返します。
func (u *FindOptimalSplit) Execute(path []int, locked []bool, maxSections int) ([]SplitResult, error) {
	if len(path) < 2 {
		return nil, fmt.Errorf("findOptimalSplit: 経路には少なくとも2つの駅が必要です")
	}
	if len(locked) != len(path) {
		return nil, fmt.Errorf("findOptimalSplit: locked の長さが経路の長さと一致しません")
	}

	// months は乗車券では不要なため0を渡す
	optPaths, err := u.optimizer.Optimize(path, 0, locked, maxSections)
	if err != nil {
		return nil, err
	}

	var results []SplitResult
	for _, optPath := range optPaths {
		segs := make([]SplitSegment, len(optPath.Segments))
		for i, evalSeg := range optPath.Segments {
			segs[i] = SplitSegment{
				Path:           evalSeg.StationIDs,
				Result:         evalSeg.Result,
				StartStationID: evalSeg.StationIDs[0],
				EndStationID:   evalSeg.StationIDs[len(evalSeg.StationIDs)-1],
			}
		}
		results = append(results, SplitResult{
			TotalAmount: optPath.TotalAmount,
			Segments:    segs,
		})
	}

	return results, nil
}
