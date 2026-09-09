package usecase

import (
	"calculation-engine/internal/domain"
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

// TicketCalculationUseCase はResolverが選んだ候補を運賃計算器で評価します。
// 特例の判定や補正の順番はSpecialFareRuleResolverに委譲します。
type TicketCalculationUseCase struct {
	calc     *CalculateAmount
	resolver *SpecialFareRuleResolver
}

func NewTicketCalculationUseCase(calc *CalculateAmount, resolver *SpecialFareRuleResolver) *TicketCalculationUseCase {
	return &TicketCalculationUseCase{calc: calc, resolver: resolver}
}

func (u *TicketCalculationUseCase) Execute(path []int, months int) (*CalculationResult, []int, error) {
	return u.ExecuteWithMode(path, months, "normal")
}

func (u *TicketCalculationUseCase) ExecuteWithMode(path []int, months int, mode string) (*CalculationResult, []int, error) {
	candidates, err := u.resolver.Resolve(path, mode)
	if err != nil {
		return nil, nil, err
	}
	var lastErr error
	for _, candidate := range candidates {
		res, err := u.calc.Execute(candidate.Path)
		if err != nil {
			lastErr = err
			continue
		}
		if candidate.CheckThreshold && res.TotalEigyoKilo <= candidate.ThresholdKilo {
			continue
		}
		return res, candidate.Path, nil
	}
	if lastErr != nil {
		return nil, nil, lastErr
	}
	return nil, nil, domain.ErrInvalidPath
}

// TicketSegmentEvaluator は分割探索から利用される乗車券評価器です。
// 実際の特例解決と運賃計算はTicketCalculationUseCaseへ委譲します。
type TicketSegmentEvaluator struct {
	calculation       *TicketCalculationUseCase
	graph             graph.Graph
	postZoneCorrector PathCorrector
}

// NewTicketSegmentEvaluator は新しい TicketSegmentEvaluator を作成します。
func NewTicketSegmentEvaluator(calc *CalculateAmount, applier *SpecialZoneApplier, postZoneCorrector PathCorrector, reg *graphio.SpecialZoneRegistry, g graph.Graph) *TicketSegmentEvaluator {
	resolver := NewSpecialFareRuleResolver(applier, postZoneCorrector, reg, g)
	return &TicketSegmentEvaluator{
		calculation:       NewTicketCalculationUseCase(calc, resolver),
		graph:             g,
		postZoneCorrector: postZoneCorrector,
	}
}

// Execute は通常モードとして与えられた物理経路を評価します。
// ※ months は定期券とのインターフェース互換用であり、乗車券では無視されます。
func (e *TicketSegmentEvaluator) Execute(path []int, months int) (*CalculationResult, []int, error) {
	return e.calculation.Execute(path, months)
}

// ExecuteWithMode は指定された運賃計算モードで経路を評価します。
// モードごとの特例適用順序はSpecialFareRuleResolverに委譲します。
func (e *TicketSegmentEvaluator) ExecuteWithMode(path []int, months int, mode string) (*CalculationResult, []int, error) {
	return e.calculation.ExecuteWithMode(path, months, mode)
}

func (e *TicketSegmentEvaluator) applyPostZoneCorrections(path []int, applyOsakaCityCorrection bool) ([]int, error) {
	if !applyOsakaCityCorrection {
		return path, nil
	}
	correctedPath := path
	if applyOsakaCityCorrection {
		var err error
		correctedPath, err = NewOsakaCityShinOsakaCorrector().Correct(correctedPath, e.graph)
		if err != nil {
			return nil, err
		}
	}
	if e.postZoneCorrector != nil {
		var err error
		correctedPath, err = e.postZoneCorrector.Correct(correctedPath, e.graph)
		if err != nil {
			return nil, err
		}
	}
	return correctedPath, nil
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
