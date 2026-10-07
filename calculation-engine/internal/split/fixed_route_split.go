package split

import (
	"calculation-engine/internal/domain"
	"errors"
	"math"
	"sort"
)

type RouteSplitOptions struct {
	MaxSplits       int      `json:"maxSplits"`
	NoSplitStations []string `json:"noSplitStations"`
}

// OptimizeFixedRoute は、各区間を一度だけ評価し、最安となる分割位置への遷移をすべて保持します。
// 運賃評価と結果件数に依存する列挙処理を除いた計算量は O(n²) です。
func OptimizeFixedRoute(n int, evaluate func(int, int) (RouteSplitSegment, error), limits ...int) ([]RouteSplitPlan, error) {
	if len(limits) > 0 && limits[0] > 0 {
		return optimizeLimitedRoute(n, limits[0], evaluate)
	}
	if n < 2 {
		return nil, domain.ErrInvalidPath
	}
	best := make([]int, n)
	previous := make([][]int, n)
	cache := make(map[[2]int]RouteSplitSegment)
	for j := 1; j < n; j++ {
		best[j] = math.MaxInt
		for i := 0; i < j; i++ {
			if best[i] == math.MaxInt {
				continue
			}
			segment, err := evaluate(i, j)
			if err != nil {
				if errors.Is(err, domain.ErrInvalidPath) || errors.Is(err, domain.ErrNoPathExists) || errors.Is(err, domain.ErrDuplicateRoute) {
					continue
				}
				return nil, err
			}
			cache[[2]int{i, j}] = segment
			cost := best[i] + segment.Fare.Fare
			if cost < best[j] {
				best[j] = cost
				previous[j] = []int{i}
			} else if cost == best[j] {
				previous[j] = append(previous[j], i)
			}
		}
	}
	if best[n-1] == math.MaxInt {
		return nil, domain.ErrNoValidPattern
	}
	type indexedPlan struct {
		plan RouteSplitPlan
		cuts []int
	}
	var found []indexedPlan
	var reversed []int
	var walk func(int)
	walk = func(j int) {
		if j == 0 {
			cuts := make([]int, len(reversed)+1)
			segments := make([]RouteSplitSegment, len(reversed))
			for k := range reversed {
				cuts[k+1] = reversed[len(reversed)-1-k]
				segments[k] = cache[[2]int{cuts[k], cuts[k+1]}]
			}
			found = append(found, indexedPlan{RouteSplitPlan{segments, best[n-1]}, cuts})
			return
		}
		reversed = append(reversed, j)
		for _, i := range previous[j] {
			walk(i)
		}
		reversed = reversed[:len(reversed)-1]
	}
	walk(n - 1)
	sort.Slice(found, func(i, j int) bool {
		a, b := found[i].cuts, found[j].cuts
		if len(a) != len(b) {
			return len(a) < len(b)
		}
		for k := range a {
			if a[k] != b[k] {
				return a[k] < b[k]
			}
		}
		return false
	})
	plans := make([]RouteSplitPlan, len(found))
	for i := range found {
		plans[i] = found[i].plan
	}
	return plans, nil
}

// 券の枚数ごとに層を分け、枚数が異なる同額の最安パターンもすべて保持します。
func optimizeLimitedRoute(n, maxSplits int, evaluate func(int, int) (RouteSplitSegment, error)) ([]RouteSplitPlan, error) {
	if n < 2 || maxSplits > 10 {
		return nil, domain.ErrInvalidPath
	}
	layers := maxSplits + 1
	if layers > n-1 {
		layers = n - 1
	}
	costs := make([][]int, layers+1)
	previous := make([][][]int, layers+1)
	for k := range costs {
		costs[k] = make([]int, n)
		previous[k] = make([][]int, n)
		for j := range costs[k] {
			costs[k][j] = math.MaxInt
		}
	}
	costs[0][0] = 0
	cache := map[[2]int]RouteSplitSegment{}
	invalid := map[[2]int]bool{}
	for k := 1; k <= layers; k++ {
		for j := 1; j < n; j++ {
			for i := 0; i < j; i++ {
				if costs[k-1][i] == math.MaxInt {
					continue
				}
				key := [2]int{i, j}
				if invalid[key] {
					continue
				}
				segment, ok := cache[key]
				if !ok {
					var err error
					segment, err = evaluate(i, j)
					if err != nil {
						if errors.Is(err, domain.ErrInvalidPath) || errors.Is(err, domain.ErrNoPathExists) || errors.Is(err, domain.ErrDuplicateRoute) {
							invalid[key] = true
							continue
						}
						return nil, err
					}
					cache[key] = segment
				}
				cost := costs[k-1][i] + segment.Fare.Fare
				if cost < costs[k][j] {
					costs[k][j] = cost
					previous[k][j] = []int{i}
				} else if cost == costs[k][j] {
					previous[k][j] = append(previous[k][j], i)
				}
			}
		}
	}
	best := math.MaxInt
	for k := 1; k <= layers; k++ {
		if costs[k][n-1] < best {
			best = costs[k][n-1]
		}
	}
	if best == math.MaxInt {
		return nil, domain.ErrNoValidPattern
	}
	type foundPlan struct {
		plan RouteSplitPlan
		cuts []int
	}
	found := []foundPlan{}
	reversed := []int{}
	var walk func(int, int)
	walk = func(k, j int) {
		if k == 0 {
			cuts := make([]int, len(reversed)+1)
			segments := make([]RouteSplitSegment, len(reversed))
			for x := range reversed {
				cuts[x+1] = reversed[len(reversed)-1-x]
				segments[x] = cache[[2]int{cuts[x], cuts[x+1]}]
			}
			found = append(found, foundPlan{RouteSplitPlan{segments, best}, cuts})
			return
		}
		reversed = append(reversed, j)
		for _, i := range previous[k][j] {
			walk(k-1, i)
		}
		reversed = reversed[:len(reversed)-1]
	}
	for k := 1; k <= layers; k++ {
		if costs[k][n-1] == best {
			walk(k, n-1)
		}
	}
	sort.Slice(found, func(i, j int) bool {
		a, b := found[i].cuts, found[j].cuts
		if len(a) != len(b) {
			return len(a) < len(b)
		}
		for k := range a {
			if a[k] != b[k] {
				return a[k] < b[k]
			}
		}
		return false
	})
	plans := make([]RouteSplitPlan, len(found))
	for i := range found {
		plans[i] = found[i].plan
	}
	return plans, nil
}
