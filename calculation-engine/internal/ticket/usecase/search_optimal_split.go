package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"fmt"
	"math"
	"slices"
)

// ticketCandidateDetour は分割探索と分割前の運賃比較に共通の最小迂回許容距離です。
// 穂積→高蔵寺では、美濃太田・多治見経由が最短の名古屋経由より擬制キロで7.5 km長く、通し運賃が安くなります。
const ticketCandidateDetour domain.DeciKilo = 75

// TicketSplitSegment は分割された個々の区間とその運賃計算結果を保持します。
type TicketSplitSegment struct {
	SourcePath     []int // 延長・補正前の乗車券経路（近郊区間判定用）
	Path           []int
	Result         *CalculationResult
	StartStationID int
	EndStationID   int
}

// SearchOptimalSplit は乗車券の最適分割を探索するユースケースです。
type SearchOptimalSplit struct {
	graph     graph.Graph
	evaluator *TicketSegmentEvaluator
	zones     *graphio.SpecialZoneRegistry
	fares     []int32
}

// NewSearchOptimalSplit は新しい SearchOptimalSplit を作成します。
func NewSearchOptimalSplit(
	g graph.Graph,
	evaluator *TicketSegmentEvaluator,
	zones *graphio.SpecialZoneRegistry,
) *SearchOptimalSplit {
	return &SearchOptimalSplit{
		graph:     g,
		zones:     zones,
		evaluator: evaluator,
	}
}

// SetPrecomputedFares は事前計算された運賃データを設定します。
func (u *SearchOptimalSplit) SetPrecomputedFares(fares []int32) {
	u.fares = fares
}

// Execute は指定された区間における乗車券の最適な分割パターンを探索します。
func (u *SearchOptimalSplit) Execute(startID, endID, maxSections int) ([][]int, error) {
	return u.ExecuteWithOptions(startID, endID, maxSections, nil)
}

// ExecuteWithOptions は分割禁止駅を考慮して、指定された区間の最適分割を探索します。
// lockedStations に含まれる駅は、経路上に存在しても分割境界として使用しません。
// visitorsを指定すると最安金額の確定後に各駅列を通知し、返値には蓄積しません。
// コールバックへ渡す駅列は独立した配列です。省略時の順序・戻り値は従来どおりです。
func (u *SearchOptimalSplit) ExecuteWithOptions(startID, endID, maxSections int, lockedStations []int, visitors ...func([]int)) ([][]int, error) {
	if startID == endID {
		return nil, domain.ErrInvalidPath
	}
	locked := makeLockedStationSet(lockedStations)

	pathsResult, err := u.candidatePaths(startID, endID)
	if err != nil {
		return nil, err
	}

	minTotalFare := math.MaxInt
	var enumerators []func(func([]int))

	segmentFare := u.segmentFare
	if u.fares == nil && len(pathsResult) > 1 {
		// 複数の候補に共通する部分経路は一度だけ評価する。発着駅が同じ別経路は駅列全体で区別する。
		type fareEntry struct {
			path  []int
			cost  int
			valid bool
		}
		costs := make(map[[2]int][]fareEntry)
		segmentFare = func(path []int) (int, bool) {
			key := [2]int{path[0], path[len(path)-1]}
			for _, entry := range costs[key] {
				if slices.Equal(entry.path, path) {
					return entry.cost, entry.valid
				}
			}
			cost, ok := u.segmentFare(path)
			costs[key] = append(costs[key], fareEntry{path, cost, ok})
			return cost, ok
		}
	}
	for _, pr := range pathsResult {
		path := pr.StationIDs
		n := len(path)
		if maxSections <= 0 {
			minCostToEnd, enumerate := u.prepareUnlimitedSplit(path, locked, segmentFare)
			if minCostToEnd < minTotalFare {
				minTotalFare = minCostToEnd
				enumerators = nil
			}
			if minCostToEnd == minTotalFare && minCostToEnd != math.MaxInt {
				enumerators = append(enumerators, enumerate)
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

		cache := make([][]int, n*n)

		for j := 1; j < n; j++ {
			if j < n-1 && isLockedStation(path[j], locked) {
				continue
			}
			for i := 0; i < j; i++ {
				if i > 0 && isLockedStation(path[i], locked) {
					continue
				}
				subPath := path[i : j+1 : j+1]
				cost, ok := segmentFare(subPath)
				if !ok {
					continue
				}

				// 元の経路と共有する読み取り専用スライスを保持し、駅列の複製を避ける。
				cache[i*n+j] = subPath

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
			enumerators = nil
		}

		if minCostToEnd == minTotalFare && minCostToEnd != math.MaxInt {
			enumerators = append(enumerators, func(emit func([]int)) {
				var backtrack func(j, k int, currentPaths [][]int)
				backtrack = func(j, k int, currentPaths [][]int) {
					if j == 0 {
						var splitStations []int
						// 最初の経路の始点
						if len(currentPaths) > 0 {
							splitStations = append(splitStations, currentPaths[len(currentPaths)-1][0])
						}
						// 各経路の終点
						for x := len(currentPaths) - 1; x >= 0; x-- {
							path := currentPaths[x]
							splitStations = append(splitStations, path[len(path)-1])
						}
						emit(splitStations)
						return
					}
					for _, i := range prev[k][j] {
						subPath := cache[i*n+j]
						newPaths := make([][]int, len(currentPaths))
						copy(newPaths, currentPaths)
						newPaths = append(newPaths, subPath)
						backtrack(i, k-1, newPaths)
					}
				}

				for k := 1; k <= maxK; k++ {
					if dp[k][n-1] == minCostToEnd {
						backtrack(n-1, k, nil)
					}
				}
			})
		}
	}

	var results [][]int
	seen := map[string]bool{}
	emit := func(path []int) {
		key := fmt.Sprint(path)
		if seen[key] {
			return
		}
		seen[key] = true
		if len(visitors) > 0 {
			visitors[0](path)
		} else {
			results = append(results, path)
		}
	}
	if minTotalFare == math.MaxInt || len(enumerators) == 0 {
		emit([]int{startID, endID})
	} else {
		for _, enumerate := range enumerators {
			enumerate(emit)
		}
	}
	return results, nil
}

// searchUnlimitedSplit は区間数無制限の最適分割を O(n²) で探索し、
// 最安運賃となる分割を区間数にかかわらずすべて返します。
func (u *SearchOptimalSplit) searchUnlimitedSplit(path []int) (int, [][]int) {
	return u.searchUnlimitedSplitWithLocks(path, nil)
}

func (u *SearchOptimalSplit) searchUnlimitedSplitWithLocks(path []int, locked map[int]struct{}) (int, [][]int) {
	cost, enumerate := u.prepareUnlimitedSplit(path, locked, u.segmentFare)
	var results [][]int
	if enumerate != nil {
		enumerate(func(path []int) { results = append(results, path) })
	}
	return cost, results
}

func (u *SearchOptimalSplit) prepareUnlimitedSplit(path []int, locked map[int]struct{}, segmentFare func([]int) (int, bool)) (int, func(func([]int))) {
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

			cost, ok := segmentFare(path[i : j+1 : j+1])
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

	enumerate := func(emit func([]int)) {
		var backtrack func(j int, reversedEnds []int)
		backtrack = func(j int, reversedEnds []int) {
			if j == 0 {
				splitStations := make([]int, len(reversedEnds)+1)
				splitStations[0] = path[0]
				for i, pathIndex := range reversedEnds {
					splitStations[len(reversedEnds)-i] = path[pathIndex]
				}
				emit(splitStations)
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

	}
	return dp[n-1], enumerate
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

	res, _, err := u.evaluator.ExecuteForSplit(path, 0)
	if err != nil {
		return 0, false
	}
	return res.TotalAmount(), true
}

// candidatePaths は発着駅それぞれの市内中心駅までの距離を迂回許容距離に反映します。
func (u *SearchOptimalSplit) candidatePaths(start, end int) ([]*graph.PathResult, error) {
	shortest, err := u.graph.FindShortestPathGisei(start, end)
	if err != nil {
		return nil, err
	}
	detour := ticketCandidateDetour
	if u.zones != nil {
		for _, id := range []int{start, end} {
			for _, zone := range u.zones.StationToZones[u.graph.GetName(id)] {
				center, ok := u.graph.GetID(graphio.ZoneCenterStations[zone.Name])
				if !ok || center == id {
					continue
				}
				path, err := u.graph.FindShortestPathGisei(id, center)
				if err == nil {
					detour = max(detour, path.GiseiKilo)
				}
			}
		}
	}
	return u.graph.FindUnboundedKShortestPathsGisei(start, end, shortest.GiseiKilo+detour)
}

// CalculateUnsplitTicket は分割前の候補経路を最安モードで評価し、最も安い券面と運賃を返します。
func (u *SearchOptimalSplit) CalculateUnsplitTicket(start, end int, calculator *RouteTicketCalculator) (RouteTicketFare, *CalculationResult, error) {
	paths, err := u.candidatePaths(start, end)
	if err != nil {
		return RouteTicketFare{}, nil, err
	}

	var bestFare RouteTicketFare
	var bestResult *CalculationResult
	var firstErr error
	for _, path := range paths {
		fare, result, err := calculator.calculate(path.StationIDs, nil, "cheapest", false)
		if err != nil {
			if firstErr == nil {
				firstErr = err
			}
			continue
		}
		if bestResult == nil || fare.Fare < bestFare.Fare {
			bestFare, bestResult = fare, result
		}
	}
	if bestResult == nil {
		if firstErr != nil {
			return RouteTicketFare{}, nil, firstErr
		}
		return RouteTicketFare{}, nil, domain.ErrInvalidPath
	}
	return bestFare, bestResult, nil
}

// GetCheapestTicketSegments は2駅間の最も安い乗車券経路（分割なし）を取得します。
func (u *SearchOptimalSplit) GetCheapestTicketSegments(start, end int) ([]TicketSplitSegment, error) {
	pathsResult, err := u.candidatePaths(start, end)
	if err != nil {
		return nil, err
	}

	minFare := math.MaxInt
	var bestPaths [][]int
	var bestResults []*CalculationResult
	var bestSourcePaths [][]int

	for _, pr := range pathsResult {
		path := pr.StationIDs
		res, transformedPath, err := u.evaluator.ExecuteForSplit(path, 0)
		if err != nil {
			continue
		}
		fare := res.TotalAmount()
		if fare < minFare {
			minFare = fare
			bestPaths = [][]int{transformedPath}
			bestResults = []*CalculationResult{res}
			bestSourcePaths = [][]int{path}
		} else if fare == minFare {
			if !containsPath(bestPaths, transformedPath) {
				bestPaths = append(bestPaths, transformedPath)
				bestResults = append(bestResults, res)
				bestSourcePaths = append(bestSourcePaths, path)
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
			SourcePath:     bestSourcePaths[i],
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
