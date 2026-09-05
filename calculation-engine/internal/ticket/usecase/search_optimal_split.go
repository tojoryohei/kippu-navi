package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"math"
)

// TicketSplitSegment は分割された個々の区間とその運賃計算結果を保持します。
type TicketSplitSegment struct {
	Path           []int
	Result         *CalculationResult
	StartStationID int
	EndStationID   int
}

// SearchOptimalSplit は乗車券の最適分割を探索するユースケースです。
type SearchOptimalSplit struct {
	graph     graph.Graph
	evaluator *TicketSegmentEvaluator
	fares     []int32
}

// NewSearchOptimalSplit は新しい SearchOptimalSplit を作成します。
func NewSearchOptimalSplit(
	g graph.Graph,
	evaluator *TicketSegmentEvaluator,
) *SearchOptimalSplit {
	return &SearchOptimalSplit{
		graph:     g,
		evaluator: evaluator,
	}
}

// SetPrecomputedFares は事前計算された運賃データを設定します。
func (u *SearchOptimalSplit) SetPrecomputedFares(fares []int32) {
	u.fares = fares
}

// Execute は指定された区間における乗車券の最適な分割パターンを探索します。
func (u *SearchOptimalSplit) Execute(startID, endID, maxSections int) ([][]int, error) {
	if startID == endID {
		return nil, domain.ErrInvalidPath
	}

	// 1. 候補駅（candStations）の抽出
	// 最短経路から駅を抽出します。
	shortest, err := u.graph.FindShortestPathGisei(startID, endID)
	if err != nil {
		return nil, domain.ErrInvalidPath
	}

	// 乗車券の場合は、運賃の振れ幅がそこまで大きくないため、最短経路＋多少の迂回経路の駅を候補とします。
	maxGisei := shortest.GiseiKilo + 50
	pathsResult, err := u.graph.FindUnboundedKShortestPathsGisei(startID, endID, maxGisei)
	if err != nil {
		return nil, domain.ErrInvalidPath
	}

	minTotalFare := math.MaxInt
	var bestResultPaths [][]int

	for _, pr := range pathsResult {
		path := pr.StationIDs
		n := len(path)

		maxK := maxSections
		if maxK <= 0 || maxK >= n {
			maxK = n - 1
		}

		dp := make([][]int, maxK+1)
		prev := make([][][]int, maxK+1)
		for k := 0; k <= maxK; k++ {
			dp[k] = make([]int, n)
			prev[k] = make([][]int, n)
			for i := range dp[k] {
				dp[k][i] = math.MaxInt
			}
		}
		dp[0][0] = 0

		type evalRes struct {
			fare  int
			oPath []int
		}
		cache := make([]evalRes, n*n)

		for j := 1; j < n; j++ {
			for i := 0; i < j; i++ {
				subPath := path[i : j+1]
				var cost int
				
				if u.fares != nil {
					startSt := subPath[0]
					endSt := subPath[len(subPath)-1]
					numSt := u.graph.NumStations()
					idx := int32(startSt)*int32(numSt) + int32(endSt)
					if idx >= 0 && int(idx) < len(u.fares) && u.fares[idx] != math.MaxInt32 {
						cost = int(u.fares[idx])
					} else {
						continue
					}
				} else {
					res, _, err := u.evaluator.Execute(subPath, 0)
					if err != nil {
						continue
					}
					cost = res.TotalAmount()
				}
				
				// Make a copy of subPath since it's a slice of path
				subPathCopy := make([]int, len(subPath))
				copy(subPathCopy, subPath)
				cache[i*n+j] = evalRes{fare: cost, oPath: subPathCopy}

				for k := 1; k <= maxK; k++ {
					if dp[k-1][i] == math.MaxInt {
						continue
					}
					total := dp[k-1][i] + cost
					if total < dp[k][j] {
						dp[k][j] = total
						prev[k][j] = []int{i}
					} else if total == dp[k][j] {
						prev[k][j] = append(prev[k][j], i)
					}
				}
			}
		}

		minCostToEnd := math.MaxInt
		for k := 1; k <= maxK; k++ {
			if dp[k][n-1] < minCostToEnd {
				minCostToEnd = dp[k][n-1]
			}
		}

		if minCostToEnd < minTotalFare {
			minTotalFare = minCostToEnd
			bestResultPaths = nil
		}

		if minCostToEnd == minTotalFare && minCostToEnd != math.MaxInt {
			var backtrack func(j, k int, currentPaths [][]int)
			backtrack = func(j, k int, currentPaths [][]int) {
				if j == 0 {
					var splitStations []int
					// The first station of the first path
					if len(currentPaths) > 0 {
						splitStations = append(splitStations, currentPaths[len(currentPaths)-1][0])
					}
					// The last station of each path
					for x := len(currentPaths) - 1; x >= 0; x-- {
						path := currentPaths[x]
						splitStations = append(splitStations, path[len(path)-1])
					}
					bestResultPaths = append(bestResultPaths, splitStations)
					return
				}
				for _, i := range prev[k][j] {
					eval := cache[i*n+j]
					newPaths := make([][]int, len(currentPaths))
					copy(newPaths, currentPaths)
					newPaths = append(newPaths, eval.oPath)
					backtrack(i, k-1, newPaths)
				}
			}

			for k := 1; k <= maxK; k++ {
				if dp[k][n-1] == minCostToEnd {
					backtrack(n-1, k, nil)
					break // only need one optimal split per path
				}
			}
		}
	}

	if minTotalFare == math.MaxInt || len(bestResultPaths) == 0 {
		return [][]int{{startID, endID}}, nil
	}

	return bestResultPaths, nil
}

// GetCheapestTicketSegments は2駅間の最も安い乗車券経路（分割なし）を取得します。
func (u *SearchOptimalSplit) GetCheapestTicketSegments(start, end int) ([]TicketSplitSegment, error) {
	shortest, err := u.graph.FindShortestPathGisei(start, end)
	if err != nil {
		return nil, domain.ErrInvalidPath
	}
	maxGisei := shortest.GiseiKilo + 50

	pathsResult, err := u.graph.FindUnboundedKShortestPathsGisei(start, end, maxGisei)
	if err != nil {
		return nil, domain.ErrInvalidPath
	}

	minFare := math.MaxInt
	var bestPaths [][]int
	var bestResults []*CalculationResult

	for _, pr := range pathsResult {
		path := pr.StationIDs
		res, transformedPath, err := u.evaluator.Execute(path, 0)
		if err != nil {
			continue
		}
		fare := res.TotalAmount()
		if fare < minFare {
			minFare = fare
			bestPaths = [][]int{transformedPath}
			bestResults = []*CalculationResult{res}
		} else if fare == minFare {
			if !containsPath(bestPaths, transformedPath) {
				bestPaths = append(bestPaths, transformedPath)
				bestResults = append(bestResults, res)
			}
		}
	}

	if minFare == math.MaxInt {
		return nil, domain.ErrInvalidPath
	}

	var segs []TicketSplitSegment
	for i, path := range bestPaths {
		segs = append(segs, TicketSplitSegment{
			Path:           path,
			Result:         bestResults[i],
			StartStationID: start,
			EndStationID:   end,
		})
	}

	return segs, nil
}

func containsPath(paths [][]int, path []int) bool {
	for _, p := range paths {
		if len(p) != len(path) {
			continue
		}
		match := true
		for i := range p {
			if p[i] != path[i] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func generateCombinations(candidates [][]TicketSplitSegment) [][]TicketSplitSegment {
	if len(candidates) == 0 {
		return nil
	}

	var results [][]TicketSplitSegment
	var current []TicketSplitSegment

	var backtrack func(depth int)
	backtrack = func(depth int) {
		if depth == len(candidates) {
			combo := make([]TicketSplitSegment, len(current))
			copy(combo, current)
			results = append(results, combo)
			return
		}

		for _, seg := range candidates[depth] {
			current = append(current, seg)
			backtrack(depth + 1)
			current = current[:len(current)-1]
		}
	}

	backtrack(0)
	return results
}
