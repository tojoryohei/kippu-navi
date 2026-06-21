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

// Optimize は指定された制約のもとで最適な分割経路を探索します。
// locked[i] が true の駅インデックスでは分割が禁止されます。
// locked が nil または空の場合、すべての駅で分割可能として扱います。
// maxSections が 0 より大きい場合、その区間数以下の分割のみを評価します。
// maxSections が 1 の場合は、分割なし（通し運賃のみ）となります。
func (o *DPOptimizer[T]) Optimize(path []int, months int, locked []bool, maxSections int) ([]usecase.OptimizedPath[T], error) {
	n := len(path)
	if n < 2 {
		return nil, ErrInvalidPathLength
	}

	// 実際の最大区間数（k）を決定。無制限(0)なら n-1 が上限。
	maxK := n - 1
	if maxSections > 0 && maxSections < maxK {
		maxK = maxSections
	}

	cache := make([]T, n*n)
	const INF = math.MaxInt

	// dp[k][i]: k個の区間で駅iに到達する最小コスト
	dp := make([][]int, maxK+1)
	for k := 0; k <= maxK; k++ {
		dp[k] = make([]int, n)
		for i := range dp[k] {
			dp[k][i] = INF
		}
	}
	dp[0][0] = 0 // 0区間で駅0に到達するコストは0

	// prev[k][j]: k個の区間で駅jに到達する際、直前の駅(i)のリスト
	prev := make([][][]int, maxK+1)
	for k := 0; k <= maxK; k++ {
		prev[k] = make([][]int, n)
	}

	var lastErr error

	// DP更新
	for j := 1; j < n; j++ {
		// jが終点以外の場合、locked[j] ならここで終わる区間は作れない
		if j < n-1 && len(locked) > j && locked[j] {
			continue
		}

		for i := 0; i < j; i++ {
			// iが始点以外の場合、locked[i] ならここから始まる区間は作れない
			if i > 0 && len(locked) > i && locked[i] {
				continue
			}

			// i〜j間の運賃計算
			subPath := path[i : j+1]
			res, err := o.evaluator.Execute(subPath, months)
			if err != nil {
				lastErr = err
				continue
			}
			cache[i*n+j] = res
			cost := res.TotalAmount()

			// k: 分割回数ではなく「区間数」。1区間〜maxK区間について更新。
			for k := 1; k <= maxK; k++ {
				if dp[k-1][i] == INF {
					continue // (k-1)区間で駅iに到達できない場合はスキップ
				}
				
				totalCost := dp[k-1][i] + cost
				if totalCost < dp[k][j] {
					dp[k][j] = totalCost
					prev[k][j] = []int{i}
				} else if totalCost == dp[k][j] {
					prev[k][j] = append(prev[k][j], i)
				}
			}
		}
	}

	// 終点(n-1)への到達コストの中で、最も安いものを探す
	minCost := INF
	for k := 1; k <= maxK; k++ {
		if dp[k][n-1] < minCost {
			minCost = dp[k][n-1]
		}
	}

	if minCost == INF {
		if lastErr != nil {
			return nil, fmt.Errorf("%w: %v", ErrNoValidPattern, lastErr)
		}
		return nil, ErrNoValidPattern
	}

	// 最安コストを達成する「区間数(k)」をすべて集める
	var optimalKs []int
	for k := 1; k <= maxK; k++ {
		if dp[k][n-1] == minCost {
			optimalKs = append(optimalKs, k)
		}
	}

	// バックトラックして経路を抽出
	var paths []usecase.OptimizedPath[T]

	for _, k := range optimalKs {
		// cutPoints には [終点, ..., 始点(0)] と逆順に入る
		cutPoints := make([]int, 0, k+1)
		cutPoints = append(cutPoints, n-1)

		var dfs func(current int, currentK int)
		dfs = func(current int, currentK int) {
			if current == 0 {
				segs := make([]usecase.EvaluatedSegment[T], len(cutPoints)-1)

				// cutPoints は逆順なので、正順の Segments を作る
				for idx := 0; idx < len(cutPoints)-1; idx++ {
					endIdx := cutPoints[len(cutPoints)-2-idx]
					startIdx := cutPoints[len(cutPoints)-1-idx]

					segPath := make([]int, endIdx-startIdx+1)
					copy(segPath, path[startIdx:endIdx+1])

					segs[idx] = usecase.NewEvaluatedSegment(segPath, cache[startIdx*n+endIdx])
				}

				paths = append(paths, usecase.OptimizedPath[T]{
					TotalAmount: minCost,
					Segments:    segs,
				})
				return
			}

			// 現在の駅 current に currentK 個の区間で到達する直前の駅候補を辿る
			for _, p := range prev[currentK][current] {
				cutPoints = append(cutPoints, p)
				dfs(p, currentK-1)
				cutPoints = cutPoints[:len(cutPoints)-1]
			}
		}
		dfs(n-1, k)
	}

	return paths, nil
}
