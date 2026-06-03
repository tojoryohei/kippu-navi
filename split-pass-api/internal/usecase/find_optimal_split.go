package usecase

import (
	"fmt"
	"split-pass-api/internal/domain"
)

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
	Path   []int
	Result T
}

// NewEvaluatedSegment は、経路と結果を指定して EvaluatedSegment を生成します。
func NewEvaluatedSegment[T EvaluationResult](path []int, res T) EvaluatedSegment[T] {
	return EvaluatedSegment[T]{
		Path:   path,
		Result: res,
	}
}

// OptimizedPath は、オプティマイザが算出した1つの経路分割パターンを保持します。
type OptimizedPath[T EvaluationResult] struct {
	TotalAmount int
	Segments    []EvaluatedSegment[T]
}

// SplitSegment は分割された個々の区間とその運賃計算結果の型エイリアスです。
type SplitSegment = EvaluatedSegment[*CalculationResult]

// SplitResult は最適な分割結果とその内訳の型エイリアスです。
type SplitResult = OptimizedPath[*CalculationResult]

// SplitOptimizer は経路の最適分割を行うアルゴリズムのインターフェースです。
type SplitOptimizer[T EvaluationResult] interface {
	Optimize(path []int, months int) ([]OptimizedPath[T], error)
}

// FindOptimalSplitUseCase は経路から分割定期券の最安パターンを見つけるユースケースです。
// DPなどの具体的なアルゴリズムは SplitOptimizer に委譲されます。
type FindOptimalSplitUseCase struct {
	optimizer SplitOptimizer[*CalculationResult]
}

// NewFindOptimalSplitUseCase は新しい FindOptimalSplitUseCase を作成します。
func NewFindOptimalSplitUseCase(opt SplitOptimizer[*CalculationResult]) *FindOptimalSplitUseCase {
	return &FindOptimalSplitUseCase{
		optimizer: opt,
	}
}

// Execute は指定された経路の全分割パターンを評価し、最安となる分割結果をすべて返します。
func (u *FindOptimalSplitUseCase) Execute(path []int, months int) ([]SplitResult, error) {
	if months != 1 && months != 3 && months != 6 {
		return nil, fmt.Errorf("findOptimalSplit: %w", domain.ErrInvalidMonths)
	}
	return u.optimizer.Optimize(path, months)
}
