package usecase

import "fmt"

// EvaluationResult は、運賃計算結果を抽象化するインターフェースです。
type EvaluationResult interface {
	TotalAmount() int
}

// RouteEvaluator は、指定された経路と期間に対する運賃計算を行うインターフェースです。
type RouteEvaluator[T EvaluationResult] interface {
	Execute(path []int, months int) (T, error)
}

// EvaluatedSegment は、評価済みの区間の経路と結果を保持します。
type EvaluatedSegment[T EvaluationResult] struct {
	StationIDs []int
	Result     T
}

// NewEvaluatedSegment は、経路と結果を指定して EvaluatedSegment を生成します。
func NewEvaluatedSegment[T EvaluationResult](path []int, res T) EvaluatedSegment[T] {
	return EvaluatedSegment[T]{
		StationIDs: path,
		Result:     res,
	}
}

// OptimizedPath は、オプティマイザが算出した1つの経路分割パターンを保持します。
type OptimizedPath[T EvaluationResult] struct {
	TotalAmount int
	Segments    []EvaluatedSegment[T]
}

// SplitSegment は分割された個々の区間とその運賃計算結果を保持します。
type SplitSegment struct {
	Path   []int
	Result *CalculationResult
}

// SplitResult は最適な分割結果とその内訳を保持します。
type SplitResult struct {
	TotalAmount int
	Segments    []SplitSegment
}

// SplitOptimizer は経路の最適分割を行うアルゴリズムのインターフェースです。
// locked[i] が true の駅インデックスでは分割が禁止されます。
type SplitOptimizer[T EvaluationResult] interface {
	Optimize(path []int, months int, locked []bool, maxSections int) ([]OptimizedPath[T], error)
}

// FindOptimalSplit は経路から分割定期券の最安パターンを見つけるユースケースです。
// DPなどの具体的なアルゴリズムは SplitOptimizer に委譲されます。
type FindOptimalSplit struct {
	optimizer SplitOptimizer[*CalculationResult]
	calc      *CalculateAmount
}

// NewFindOptimalSplit は新しい FindOptimalSplit を作成します。
func NewFindOptimalSplit(opt SplitOptimizer[*CalculationResult], calc *CalculateAmount) *FindOptimalSplit {
	return &FindOptimalSplit{
		optimizer: opt,
		calc:      calc,
	}
}

// Execute は指定された経路の全分割パターンを評価し、最安となる分割結果をすべて返します。
// locked[i] が true の駅インデックスでは分割が禁止されます。
func (u *FindOptimalSplit) Execute(path []int, months int, locked []bool, maxSections int) ([]SplitResult, error) {
	if len(path) < 2 {
		return nil, fmt.Errorf("findOptimalSplit: 経路には少なくとも2つの駅が必要です")
	}
	if len(locked) != len(path) {
		return nil, fmt.Errorf("findOptimalSplit: locked の長さが経路の長さと一致しません")
	}

	optPaths, err := u.optimizer.Optimize(path, months, locked, maxSections)
	if err != nil {
		return nil, err
	}

	var results []SplitResult
	for _, optPath := range optPaths {
		segs := make([]SplitSegment, len(optPath.Segments))
		for i, evalSeg := range optPath.Segments {
			segs[i] = SplitSegment{
				Path:   evalSeg.StationIDs,
				Result: evalSeg.Result,
			}
		}
		results = append(results, SplitResult{
			TotalAmount: optPath.TotalAmount,
			Segments:    segs,
		})
	}

	return results, nil
}
