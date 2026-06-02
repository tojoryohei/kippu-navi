package optimizer

import (
	"errors"
	"fmt"
	"math"
	"split-pass-api/internal/usecase"
)

var (
	// ErrInvalidPathLength は、経路として指定された駅数が足りない場合のエラーです。
	ErrInvalidPathLength = errors.New("経路には少なくとも2つの駅が必要です")
	// ErrNoValidPattern は、有効な分割パターンが見つからなかった場合のエラーです。
	ErrNoValidPattern = errors.New("有効な分割パターンが見つかりませんでした")
)

// DPOptimizer は、1次元動的計画法 (DP) を使用して最適な経路分割を探索するアルゴリズムクラスです。
type DPOptimizer[T usecase.EvaluationResult] struct {
	evaluator usecase.RouteEvaluator[T]
}

// NewDPOptimizer は DPOptimizer を生成します。
func NewDPOptimizer[T usecase.EvaluationResult](evaluator usecase.RouteEvaluator[T]) *DPOptimizer[T] {
	return &DPOptimizer[T]{
		evaluator: evaluator,
	}
}

// Optimize は O(N^3) で最適な分割経路を探索します。
func (o *DPOptimizer[T]) Optimize(path []int, months int) ([]usecase.OptimizedPath[T], error) {
	n := len(path)
	if n < 2 {
		return nil, ErrInvalidPathLength
	}

	cache := make([]T, n*n)

	const INF = math.MaxInt
	dp := make([]int, n)
	for i := range dp {
		dp[i] = INF
	}
	dp[0] = 0

	prev := make([][]int, n)
	var lastErr error

	for j := 1; j < n; j++ {
		for i := 0; i < j; i++ {
			if dp[i] == INF {
				continue
			}

			subPath := path[i : j+1]
			res, err := o.evaluator.Execute(subPath, months)
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
			return nil, fmt.Errorf("%w: %w", ErrNoValidPattern, lastErr)
		}
		return nil, ErrNoValidPattern
	}

	// バックトラックして全ての分割パターンを抽出し、EvaluatedSegmentのリストに変換する
	var paths []usecase.OptimizedPath[T]
	cutPoints := make([]int, 0, n)
	cutPoints = append(cutPoints, n-1)

	var dfs func(current int)
	dfs = func(current int) {
		if current == 0 {
			segs := make([]usecase.EvaluatedSegment[T], len(cutPoints)-1)

			// cutPointsには [終点, ..., 始点(0)] と逆順に入っているため、逆から読んで正順のSegmentsを作る
			for k := 0; k < len(cutPoints)-1; k++ {
				endIdx := cutPoints[len(cutPoints)-2-k]
				startIdx := cutPoints[len(cutPoints)-1-k]

				// 経路の切り出し責務をオプティマイザが持つ
				segPath := make([]int, endIdx-startIdx+1)
				copy(segPath, path[startIdx:endIdx+1])

				// ここで cache を参照する。
				// p が prev[current] に含まれているということは、DPの計算フェーズにおいて
				// path[p:current+1] の運賃計算が正常に完了し cache に格納されていることが
				// 保証されているため、ゼロ値（未計算）を引くことはない。
				segs[k] = usecase.NewEvaluatedSegment(segPath, cache[startIdx*n+endIdx])
			}

			paths = append(paths, usecase.OptimizedPath[T]{
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

	return paths, nil
}
