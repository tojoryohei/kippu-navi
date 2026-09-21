package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"context"
	"math"
)

// TicketRouteCandidate keeps the travelled route separate from paths produced
// solely for fare calculation. This prevents zone transformations from being
// fed back into physical route enumeration.
type TicketRouteCandidate struct {
	PhysicalPath      []int
	FarePaths         [][]int
	PhysicalEigyoKilo domain.DeciKilo
	PhysicalGiseiKilo domain.DeciKilo
	FareGiseiKilo     []domain.DeciKilo
}

// TicketSplitSegment は分割された個々の区間とその運賃計算結果を保持します。
type TicketSplitSegment struct {
	Path           []int
	Result         *CalculationResult
	StartStationID int
	EndStationID   int
}

// SearchOptimalSplit は乗車券の最適分割を探索するユースケースです。
type SearchOptimalSplit struct {
	graph      graph.Graph
	evaluator  *TicketSegmentEvaluator
	fares      []int32
	zones      *graphio.SpecialZoneRegistry
	corrector  PathCorrector
	yenScratch *graph.YenScratch
}

const ticketCandidatePathLimit = 10

// SetPathCorrector sets the physical-route corrections that must run before
// special-zone fare candidates are generated. A fare path returned by the
// evaluator must not be corrected a second time.
func (u *SearchOptimalSplit) SetPathCorrector(corrector PathCorrector) {
	u.corrector = corrector
}

func (u *SearchOptimalSplit) correctedPhysicalPath(path []int) ([]int, error) {
	if u.corrector == nil {
		return path, nil
	}
	corrected, err := u.corrector.Correct(path, u.graph)
	if err != nil {
		return nil, err
	}
	if len(corrected) == 0 {
		return path, nil
	}
	return corrected, nil
}

func (u *SearchOptimalSplit) evaluateAll(path []int) ([]TicketFareEvaluation, error) {
	corrected, err := u.correctedPhysicalPath(path)
	if err != nil {
		return nil, err
	}
	return u.evaluator.EvaluateAllWithMode(corrected, 0, "normal")
}

// NewSearchOptimalSplit は新しい SearchOptimalSplit を作成します。
func NewSearchOptimalSplit(
	g graph.Graph,
	evaluator *TicketSegmentEvaluator,
	zones ...*graphio.SpecialZoneRegistry,
) *SearchOptimalSplit {
	search := &SearchOptimalSplit{
		graph:     g,
		evaluator: evaluator,
	}
	if len(zones) > 0 {
		search.zones = zones[0]
	}
	return search
}

// SetPrecomputedFares は事前計算された運賃データを設定します。
func (u *SearchOptimalSplit) SetPrecomputedFares(fares []int32) {
	u.fares = fares
}

// SetYenScratch は事前計算など単一goroutineで連続探索する場合の作業領域を設定します。
// 通常のAPI処理ではリクエスト間共有を避けるため使用しません。
func (u *SearchOptimalSplit) SetYenScratch(scratch *graph.YenScratch) {
	u.yenScratch = scratch
}

// Execute は指定された区間における乗車券の最適な分割パターンを探索します。
func (u *SearchOptimalSplit) Execute(startID, endID, maxSections int) ([][]int, error) {
	return u.ExecuteWithOptions(startID, endID, maxSections, nil)
}

// ExecuteWithOptions は分割禁止駅を考慮して、指定された区間の最適分割を探索します。
// lockedStations に含まれる駅は、経路上に存在しても分割境界として使用しません。
func (u *SearchOptimalSplit) ExecuteWithOptions(startID, endID, maxSections int, lockedStations []int) ([][]int, error) {
	return u.ExecuteWithContext(context.Background(), startID, endID, maxSections, lockedStations)
}

// ExecuteWithContext is the cancellable ticket search entry point.
func (u *SearchOptimalSplit) ExecuteWithContext(ctx context.Context, startID, endID, maxSections int, lockedStations []int) ([][]int, error) {
	if startID == endID {
		return nil, domain.ErrInvalidPath
	}
	locked := makeLockedStationSet(lockedStations)

	pathsResult, _, err := u.findCandidatePhysicalPaths(ctx, startID, endID)
	if err != nil {
		return nil, err
	}

	minTotalFare := math.MaxInt
	var bestResultPaths [][]int

	for _, pr := range pathsResult {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		path := pr.StationIDs
		n := len(path)
		if maxSections <= 0 {
			minCostToEnd, splitPaths := u.searchUnlimitedSplitWithLocks(path, locked)
			if minCostToEnd < minTotalFare {
				minTotalFare = minCostToEnd
				bestResultPaths = nil
			}
			if minCostToEnd == minTotalFare && minCostToEnd != math.MaxInt {
				bestResultPaths = append(bestResultPaths, splitPaths...)
			}
			continue
		}

		maxK := maxSections
		if maxK >= n {
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
			if j < n-1 && isLockedStation(path[j], locked) {
				continue
			}
			for i := 0; i < j; i++ {
				if i > 0 && isLockedStation(path[i], locked) {
					continue
				}
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
					evaluations, err := u.evaluateAll(subPath)
					if err != nil || len(evaluations) == 0 {
						continue
					}
					cost = evaluations[0].Result.TotalAmount()
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
				}
			}
		}
	}

	if minTotalFare == math.MaxInt || len(bestResultPaths) == 0 {
		return [][]int{{startID, endID}}, nil
	}

	uniquePaths := make([][]int, 0, len(bestResultPaths))
	for _, path := range bestResultPaths {
		if !containsPath(uniquePaths, path) {
			uniquePaths = append(uniquePaths, path)
		}
	}

	return uniquePaths, nil
}

func (u *SearchOptimalSplit) findCandidatePhysicalPaths(ctx context.Context, start, end int) ([]*graph.PathResult, TicketSearchDistanceLimit, error) {
	limit, err := calculateTicketSearchDistanceLimit(u.graph, u.zones, start, end)
	if err != nil {
		return nil, TicketSearchDistanceLimit{}, err
	}
	type contextPathFinder interface {
		FindKShortestPathsGiseiWithContext(context.Context, int, int, int, domain.DeciKilo) ([]*graph.PathResult, error)
	}
	if finder, ok := u.graph.(contextPathFinder); ok {
		if u.yenScratch != nil {
			type scratchPathFinder interface {
				FindKShortestPathsGiseiWithScratchContext(context.Context, int, int, int, domain.DeciKilo, *graph.YenScratch) ([]*graph.PathResult, error)
			}
			if scratchFinder, ok := u.graph.(scratchPathFinder); ok {
				paths, err := scratchFinder.FindKShortestPathsGiseiWithScratchContext(ctx, start, end, ticketCandidatePathLimit, limit.MaxGisei, u.yenScratch)
				return paths, limit, err
			}
		}
		paths, err := finder.FindKShortestPathsGiseiWithContext(ctx, start, end, ticketCandidatePathLimit, limit.MaxGisei)
		return paths, limit, err
	}
	if err := ctx.Err(); err != nil {
		return nil, TicketSearchDistanceLimit{}, err
	}
	paths, err := u.graph.FindUnboundedKShortestPathsGisei(start, end, limit.MaxGisei)
	if len(paths) > ticketCandidatePathLimit {
		paths = paths[:ticketCandidatePathLimit]
	}
	return paths, limit, err
}

// searchUnlimitedSplit は区間数無制限の最適分割を O(n²) で探索し、
// 最安運賃となる分割を区間数にかかわらずすべて返します。
func (u *SearchOptimalSplit) searchUnlimitedSplit(path []int) (int, [][]int) {
	return u.searchUnlimitedSplitWithLocks(path, nil)
}

func (u *SearchOptimalSplit) searchUnlimitedSplitWithLocks(path []int, locked map[int]struct{}) (int, [][]int) {
	n := len(path)
	dp := make([]int, n)
	prev := make([][]int, n)
	for i := range dp {
		dp[i] = math.MaxInt
	}
	dp[0] = 0

	for j := 1; j < n; j++ {
		if j < n-1 && isLockedStation(path[j], locked) {
			continue
		}
		for i := 0; i < j; i++ {
			if i > 0 && isLockedStation(path[i], locked) {
				continue
			}
			if dp[i] == math.MaxInt {
				continue
			}

			cost, ok := u.segmentFare(path[i : j+1])
			if !ok {
				continue
			}

			total := dp[i] + cost
			if total < dp[j] {
				dp[j] = total
				prev[j] = []int{i}
			} else if total == dp[j] {
				prev[j] = append(prev[j], i)
			}
		}
	}

	if dp[n-1] == math.MaxInt {
		return math.MaxInt, nil
	}

	var results [][]int
	var backtrack func(j int, reversedEnds []int)
	backtrack = func(j int, reversedEnds []int) {
		if j == 0 {
			splitStations := make([]int, len(reversedEnds)+1)
			splitStations[0] = path[0]
			for i, pathIndex := range reversedEnds {
				splitStations[len(reversedEnds)-i] = path[pathIndex]
			}
			results = append(results, splitStations)
			return
		}

		for _, i := range prev[j] {
			nextEnds := make([]int, len(reversedEnds)+1)
			copy(nextEnds, reversedEnds)
			nextEnds[len(reversedEnds)] = j
			backtrack(i, nextEnds)
		}
	}
	backtrack(n-1, nil)

	return dp[n-1], results
}

func makeLockedStationSet(stations []int) map[int]struct{} {
	if len(stations) == 0 {
		return nil
	}
	locked := make(map[int]struct{}, len(stations))
	for _, station := range stations {
		locked[station] = struct{}{}
	}
	return locked
}

func isLockedStation(stationID int, locked map[int]struct{}) bool {
	if len(locked) == 0 {
		return false
	}
	_, ok := locked[stationID]
	return ok
}

func (u *SearchOptimalSplit) segmentFare(path []int) (int, bool) {
	if u.fares != nil {
		numStations := u.graph.NumStations()
		idx := path[0]*numStations + path[len(path)-1]
		if idx < 0 || idx >= len(u.fares) || u.fares[idx] == math.MaxInt32 {
			return 0, false
		}
		return int(u.fares[idx]), true
	}

	evaluations, err := u.evaluateAll(path)
	if err != nil || len(evaluations) == 0 {
		return 0, false
	}
	return evaluations[0].Result.TotalAmount(), true
}

// GetCheapestTicketSegments は2駅間の最も安い乗車券経路（分割なし）を取得します。
func (u *SearchOptimalSplit) GetCheapestTicketSegments(start, end int) ([]TicketSplitSegment, error) {
	return u.GetCheapestTicketSegmentsWithContext(context.Background(), start, end)
}

func (u *SearchOptimalSplit) GetCheapestTicketSegmentsWithContext(ctx context.Context, start, end int) ([]TicketSplitSegment, error) {
	pathsResult, _, err := u.findCandidatePhysicalPaths(ctx, start, end)
	if err != nil {
		return nil, err
	}

	minFare := math.MaxInt
	var bestPaths [][]int
	var bestResults []*CalculationResult

	for _, pr := range pathsResult {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		path := pr.StationIDs
		evaluations, err := u.evaluateAll(path)
		if err != nil {
			continue
		}
		for _, evaluation := range evaluations {
			fare := evaluation.Result.TotalAmount()
			if fare < minFare {
				minFare = fare
				bestPaths = [][]int{evaluation.Path}
				bestResults = []*CalculationResult{evaluation.Result}
			} else if fare == minFare && !containsPath(bestPaths, evaluation.Path) {
				bestPaths = append(bestPaths, evaluation.Path)
				bestResults = append(bestResults, evaluation.Result)
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
