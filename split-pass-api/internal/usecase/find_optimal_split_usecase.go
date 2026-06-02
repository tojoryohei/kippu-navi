package usecase

import (
	"errors"
	"fmt"
	"math"
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

var (
	ErrNoValidSplitPattern = errors.New("有効な分割パターンが見つかりませんでした")
)

// Execute は指定された経路の全分割パターンを評価し、最安となる分割結果をすべて返します。
// 1次元動的計画法 (DP) を使用し、内部計算を含めて O(N^3) の時間計算量で処理します。
//
// [安全上の制約]
// 内部でサブスライスを共有するため、呼び出し元は Execute 呼び出し後も
// path の要素を変更してはなりません（Read-Only）。
func (u *FindOptimalSplitUseCase) Execute(path []int, months int) ([]SplitResult, error) {

	if months != 1 && months != 3 && months != 6 {
		return nil, fmt.Errorf("findOptimalSplit: %w", domain.ErrInvalidMonths)
	}

	n := len(path)
	if n < 2 {
		return nil, errors.New("経路には少なくとも2つの駅が必要です")
	}

	cache := make([]*CalculationResult, n*n)

	const INF = math.MaxInt
	dp := make([]int, n)
	for i := range dp {
		dp[i] = INF
	}
	dp[0] = 0

	// Goでは nil スライスに対して直接 append() することが安全であり、メモリ効率が最大化されます。
	prev := make([][]int, n)
	var lastErr error

	for j := 1; j < n; j++ {
		for i := 0; i < j; i++ {
			if dp[i] == INF {
				continue
			}

			subPath := path[i : j+1]
			res, err := u.calcUseCase.Execute(subPath, months)
			if err != nil {
				lastErr = err
				continue
			}

			cache[i*n+j] = res
			cost := dp[i] + res.TotalAmount()

			if cost < dp[j] {
				dp[j] = cost
				prev[j] = []int{i}
			} else if cost == dp[j] {
				prev[j] = append(prev[j], i)
			}
		}
	}

	if dp[n-1] == INF {
		if lastErr != nil {
			return nil, fmt.Errorf("findOptimalSplit: %w", lastErr)
		}
		return nil, fmt.Errorf("findOptimalSplit: %w", ErrNoValidSplitPattern)
	}

	var results []SplitResult

	// 改善: 探索中は「どの駅で分割したか（インデックス）」だけを記録する
	cutPoints := make([]int, 0, n)
	cutPoints = append(cutPoints, n-1)

	var dfs func(current int)
	dfs = func(current int) {
		if current == 0 {
			// 終端に到達して初めて、出力用の構造体とスライスを一気に生成する（関心の分離）
			segs := make([]SplitSegment, len(cutPoints)-1)

			// cutPointsには [終点, ..., 始点(0)] と逆順に入っているため、逆から読んで正順のSegmentsを作る
			for k := 0; k < len(cutPoints)-1; k++ {
				endIdx := cutPoints[len(cutPoints)-2-k]
				startIdx := cutPoints[len(cutPoints)-1-k]

				segPath := make([]int, endIdx-startIdx+1)
				copy(segPath, path[startIdx:endIdx+1])

				segs[k] = SplitSegment{
					Path:   segPath,
					Result: cache[startIdx*n+endIdx],
				}
			}

			results = append(results, SplitResult{
				TotalAmount: dp[n-1],
				Segments:    segs,
			})
			return
		}

		for _, p := range prev[current] {
			cutPoints = append(cutPoints, p)
			dfs(p)
			cutPoints = cutPoints[:len(cutPoints)-1]
		}
	}

	dfs(n - 1)

	return results, nil
}
