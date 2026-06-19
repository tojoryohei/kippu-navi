package usecase

import (
	"container/heap"
	"errors"
	"fmt"
	"math"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"strconv"
	"strings"
)

const (
	// unreachableDistance は接続されておらず到達不可能なキロ数（無限大）を示します。
	unreachableDistance = domain.DeciKilo(1<<31 - 1)
	// defaultMaxSectionsLimit は無制限探索時のデフォルト最大分割セグメント数です。
	defaultMaxSectionsLimit = 100
)

// SearchOptimalSplit は候補経路の探索・補正・分割最適化を統括するユースケースです。
type SearchOptimalSplit struct {
	graph       *graph.RailwayGraph
	split       *FindOptimalSplit
	rules       []domain.ResolvedBypassRule
	maxSections int
	fares       []int32
	numStations int32
}

// NewSearchOptimalSplit は新しい SearchOptimalSplit を作成します。
func NewSearchOptimalSplit(
	g *graph.RailwayGraph,
	u *FindOptimalSplit,
	rules []domain.ResolvedBypassRule,
	maxSections int,
	fares []int32,
	numStations int32,
) *SearchOptimalSplit {
	return &SearchOptimalSplit{
		graph:       g,
		split:       u,
		rules:       makeUniqueBidirectionalRules(rules),
		maxSections: maxSections,
		fares:       fares,
		numStations: numStations,
	}
}

// OptimalSearchResult は探索結果全体（通常運賃と最適分割運賃）を保持します。
type OptimalSearchResult struct {
	Normal   SplitResult   // 分割なしの最安結果
	Optimals []SplitResult // 分割時の最安結果
}

// Execute は指定された発着駅間の最安分割結果を探索します。
func (u *SearchOptimalSplit) Execute(startID, endID, months int) (*OptimalSearchResult, error) {
	shortest, err := u.graph.FindShortestPathGisei(startID, endID)
	if err != nil {
		return nil, fmt.Errorf("searchOptimalSplit: 最短経路の検索に失敗: %w", err)
	}

	calcResult, err := u.split.calc.Execute(shortest.StationIDs, months)
	if err != nil {
		return nil, fmt.Errorf("searchOptimalSplit: 最短経路の運賃計算に失敗: %w", err)
	}

	normalAmount := calcResult.TotalAmount()

	var cheapestAmountPerDecikilo float64
	kyotoID, kyotoExists := u.graph.GetID("京都")
	osakaID, osakaExists := u.graph.GetID("大阪")

	if kyotoExists && osakaExists {
		kyotoToOsakaPath, err := u.graph.FindShortestPathGisei(kyotoID, osakaID)
		if err != nil {
			return nil, fmt.Errorf("searchOptimalSplit: 京都 -> 大阪の探索に失敗: %w", err)
		}

		kyotoToOsakaAmount, err := u.split.calc.Execute(kyotoToOsakaPath.StationIDs, months)
		if err != nil {
			return nil, fmt.Errorf("searchOptimalSplit: 京都 -> 大阪の運賃計算に失敗: %w", err)
		}
		cheapestAmountPerDecikilo = float64(kyotoToOsakaAmount.TotalAmount()) / float64(kyotoToOsakaPath.EigyoKilo)
	} else if months == 1 {
		cheapestAmountPerDecikilo = 45780.0 / 100.0
	} else if months == 3 {
		cheapestAmountPerDecikilo = 130540.0 / 100.0
	} else {
		cheapestAmountPerDecikilo = 236070.0 / 100.0
	}

	maxGisei := domain.DeciKilo(float64(normalAmount) / cheapestAmountPerDecikilo)
	if maxGisei < shortest.GiseiKilo {
		maxGisei = shortest.GiseiKilo
	}

	distFromStart, _ := u.graph.FindAllShortestPathsGisei(startID)
	distToEnd, _ := u.graph.FindAllShortestPathsGisei(endID)

	candMap := make(map[int]bool)
	candMap[startID] = true
	candMap[endID] = true

	for id := 0; id < int(u.numStations); id++ {
		if distFromStart[id] == unreachableDistance || distToEnd[id] == unreachableDistance {
			continue
		}
		if distFromStart[id]+distToEnd[id] <= maxGisei {
			candMap[id] = true
		}
	}

	candStations := make([]int, 0, len(candMap))
	for id := range candMap {
		candStations = append(candStations, id)
	}

	optimals, err := u.searchOptimalSplitDijkstra(startID, endID, months, u.maxSections, candStations)
	if err != nil {
		// 分割パターンが見つからない場合は、分割なし（通常経路）の結果のみを返すか、エラーにする
		if errors.Is(err, domain.ErrNoValidPattern) {
			return &OptimalSearchResult{
				Normal: SplitResult{
					TotalAmount: normalAmount,
					Segments: []SplitSegment{
						{
							Path:   shortest.StationIDs,
							Result: calcResult,
						},
					},
				},
				Optimals: []SplitResult{
					{
						TotalAmount: normalAmount,
						Segments: []SplitSegment{
							{
								Path:   shortest.StationIDs,
								Result: calcResult,
							},
						},
					},
				},
			}, nil
		}
		return nil, err
	}

	normalResult := SplitResult{
		TotalAmount: normalAmount,
		Segments: []SplitSegment{
			{
				Path:   shortest.StationIDs,
				Result: calcResult,
			},
		},
	}

	return &OptimalSearchResult{
		Normal:   normalResult,
		Optimals: optimals,
	}, nil
}

type searchState struct {
	stationID int
	sections  int
}

type dijkstraNode struct {
	stationID int
	sections  int
	cost      int
	index     int
}

type splitPriorityQueue []*dijkstraNode

func (pq splitPriorityQueue) Len() int           { return len(pq) }
func (pq splitPriorityQueue) Less(i, j int) bool { return pq[i].cost < pq[j].cost }
func (pq splitPriorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}
func (pq *splitPriorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*dijkstraNode)
	item.index = n
	*pq = append(*pq, item)
}
func (pq *splitPriorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

func monthToIndex(months int) int {
	switch months {
	case 1:
		return 0
	case 3:
		return 1
	case 6:
		return 2
	default:
		return 0
	}
}

func (u *SearchOptimalSplit) searchOptimalSplitDijkstra(startID, endID, months, maxSections int, candStations []int) ([]SplitResult, error) {
	numStations := u.numStations

	maxK := maxSections
	if maxSections <= 0 {
		maxK = len(candStations) - 1
		if maxK > defaultMaxSectionsLimit {
			maxK = defaultMaxSectionsLimit
		}
	}

	mIdx := monthToIndex(months)

	// distTable[sections][stationID]
	const INF = math.MaxInt
	distTable := make([][]int, maxK+1)
	for s := 0; s <= maxK; s++ {
		distTable[s] = make([]int, numStations)
		for i := range distTable[s] {
			distTable[s][i] = INF
		}
	}
	distTable[0][startID] = 0

	// prevTable[sections][stationID]
	prevTable := make([][][]searchState, maxK+1)
	for s := 0; s <= maxK; s++ {
		prevTable[s] = make([][]searchState, numStations)
	}

	pq := &splitPriorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &dijkstraNode{stationID: startID, sections: 0, cost: 0})

	minCostToEnd := INF

	for pq.Len() > 0 {
		curr := heap.Pop(pq).(*dijkstraNode)

		if curr.cost > distTable[curr.sections][curr.stationID] {
			continue
		}
		if curr.cost > minCostToEnd {
			continue
		}

		if curr.stationID == endID {
			if curr.cost < minCostToEnd {
				minCostToEnd = curr.cost
			}
			continue
		}

		if curr.sections >= maxK {
			continue
		}

		nextSections := curr.sections + 1
		for _, nextID := range candStations {
			if nextID == curr.stationID {
				continue
			}

			// 事前計算された運賃マトリクスからO(1)で運賃を取得
			idx := int32(mIdx)*numStations*numStations + int32(curr.stationID)*numStations + int32(nextID)
			fareVal := int(u.fares[idx])

			if fareVal <= 0 {
				// 運賃が事前計算されていない（接続していない）場合はスキップ
				continue
			}

			newCost := curr.cost + fareVal
			if newCost < distTable[nextSections][nextID] {
				distTable[nextSections][nextID] = newCost
				prevTable[nextSections][nextID] = []searchState{{stationID: curr.stationID, sections: curr.sections}}
				heap.Push(pq, &dijkstraNode{stationID: nextID, sections: nextSections, cost: newCost})
			} else if newCost == distTable[nextSections][nextID] {
				prevTable[nextSections][nextID] = append(prevTable[nextSections][nextID], searchState{stationID: curr.stationID, sections: curr.sections})
			}
		}
	}

	if minCostToEnd == INF {
		return nil, domain.ErrNoValidPattern
	}

	// 最安コストを達成する状態からバックトラックして全経路を抽出
	var optimalPaths [][]int
	for s := 1; s <= maxK; s++ {
		if distTable[s][endID] == minCostToEnd {
			u.backtrackOptimalPaths(endID, s, startID, prevTable, nil, &optimalPaths)
		}
	}

	// 各パスについて、セグメントの実際の中間経路を動的に復元
	var results []SplitResult
	for _, path := range optimalPaths {
		var segments []SplitSegment
		isValid := true
		for i := 0; i < len(path)-1; i++ {
			seg, err := u.getCheapestNoSplitSegment(path[i], path[i+1], months)
			if err != nil {
				isValid = false
				break
			}
			segments = append(segments, seg)
		}
		if isValid {
			results = append(results, SplitResult{
				TotalAmount: minCostToEnd,
				Segments:    segments,
			})
		}
	}

	if len(results) == 0 {
		return nil, domain.ErrNoValidPattern
	}

	return results, nil
}

func (u *SearchOptimalSplit) backtrackOptimalPaths(
	currID, currS, startID int,
	prevTable [][][]searchState,
	currentPath []int,
	optimalPaths *[][]int,
) {
	newPath := make([]int, len(currentPath), len(currentPath)+1)
	copy(newPath, currentPath)
	newPath = append(newPath, currID)

	if currID == startID && currS == 0 {
		p := make([]int, len(newPath))
		for i, v := range newPath {
			p[len(newPath)-1-i] = v
		}
		*optimalPaths = append(*optimalPaths, p)
		return
	}

	for _, pred := range prevTable[currS][currID] {
		u.backtrackOptimalPaths(pred.stationID, pred.sections, startID, prevTable, newPath, optimalPaths)
	}
}

func (u *SearchOptimalSplit) getCheapestNoSplitSegment(start, end, months int) (SplitSegment, error) {
	cands, err := u.getNoSplitCandidates(start, end)
	if err != nil || len(cands) == 0 {
		return SplitSegment{}, domain.ErrInvalidPath
	}

	minFare := math.MaxInt
	var bestPath []int
	var bestResult *CalculationResult

	for _, path := range cands {
		res, err := u.split.calc.Execute(path, months)
		if err != nil {
			continue
		}
		if res.TotalAmount() < minFare {
			minFare = res.TotalAmount()
			bestPath = path
			bestResult = res
		}
	}

	if minFare == math.MaxInt {
		return SplitSegment{}, domain.ErrInvalidPath
	}

	return SplitSegment{
		Path:   bestPath,
		Result: bestResult,
	}, nil
}
func (u *SearchOptimalSplit) getNoSplitCandidates(start, end int) ([][]int, error) {
	rg := u.graph

	var cands [][]int

	// ① 最短営業キロ経路
	_, prevEigyo := rg.FindAllShortestPathsEigyo(start)
	pathEigyo := reconstructPath(prevEigyo, start, end)
	if len(pathEigyo) >= 2 {
		cands = append(cands, pathEigyo)
	}

	// ② 最短擬制キロ経路
	_, prevGisei := rg.FindAllShortestPathsGisei(start)
	pathGisei := reconstructPath(prevGisei, start, end)
	if len(pathGisei) >= 2 {
		cands = append(cands, pathGisei)
	}

	// ③ 経路全体が1つの特例に含まれる場合のみ、近道の経路
	for _, rule := range u.rules {
		aOnRule := u.containsStation(rule.ShortcutPath, start) || u.containsStation(rule.DetourPath, start)
		bOnRule := u.containsStation(rule.ShortcutPath, end) || u.containsStation(rule.DetourPath, end)
		if aOnRule && bOnRule {
			aOnDetourMiddle := u.isOnDetourMiddle(start, rule)
			bOnDetourMiddle := u.isOnDetourMiddle(end, rule)
			if aOnDetourMiddle || bOnDetourMiddle {
				shortcutPath := make([]int, len(rule.ShortcutPath))
				copy(shortcutPath, rule.ShortcutPath)
				cands = append(cands, shortcutPath)
			}
		}
	}

	// ④ 発着駅が遠回り上にあるが、完全に内包されていない場合、経由していない方の分岐駅まで特例の近道経路（オーバーシュート）
	for _, rule := range u.rules {
		startOnDetour := u.isOnDetourMiddle(start, rule)
		endOnDetour := u.isOnDetourMiddle(end, rule)

		if startOnDetour {
			// Option A: J1 から進入
			pathJ2ToEnd, err := rg.FindShortestPathGisei(rule.ShortcutPath[len(rule.ShortcutPath)-1], end)
			if err == nil && len(pathJ2ToEnd.StationIDs) >= 2 {
				cand := append([]int(nil), rule.ShortcutPath...)
				cand = append(cand, pathJ2ToEnd.StationIDs[1:]...)
				cands = append(cands, cand)
			}

			// Option B: J2 から進入
			pathJ1ToEnd, err := rg.FindShortestPathGisei(rule.ShortcutPath[0], end)
			if err == nil && len(pathJ1ToEnd.StationIDs) >= 2 {
				revShortcut := reverseSlice(rule.ShortcutPath)
				cand := append([]int(nil), revShortcut...)
				cand = append(cand, pathJ1ToEnd.StationIDs[1:]...)
				cands = append(cands, cand)
			}
		}

		if endOnDetour {
			// Option A: J1 から退出
			pathStartToJ1, err := rg.FindShortestPathGisei(start, rule.ShortcutPath[0])
			if err == nil && len(pathStartToJ1.StationIDs) >= 2 {
				cand := append([]int(nil), pathStartToJ1.StationIDs...)
				cand = append(cand, rule.ShortcutPath[1:]...)
				cands = append(cands, cand)
			}

			// Option B: J2 から退出
			pathStartToJ2, err := rg.FindShortestPathGisei(start, rule.ShortcutPath[len(rule.ShortcutPath)-1])
			if err == nil && len(pathStartToJ2.StationIDs) >= 2 {
				revShortcut := reverseSlice(rule.ShortcutPath)
				cand := append([]int(nil), pathStartToJ2.StationIDs...)
				cand = append(cand, revShortcut[1:]...)
				cands = append(cands, cand)
			}
		}
	}

	return cands, nil
}

func reconstructPath(prev []int, start, end int) []int {
	if prev == nil || end < 0 || end >= len(prev) || prev[end] == -1 {
		if start == end {
			return []int{start}
		}
		return nil
	}
	path := []int{}
	for i := end; i != -1; i = prev[i] {
		path = append(path, i)
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	return path
}

func (u *SearchOptimalSplit) containsStation(path []int, stationID int) bool {
	for _, id := range path {
		if id == stationID {
			return true
		}
	}
	return false
}

func (u *SearchOptimalSplit) isOnDetourMiddle(stationID int, rule domain.ResolvedBypassRule) bool {
	for i := 1; i < len(rule.DetourPath)-1; i++ {
		if rule.DetourPath[i] == stationID {
			return true
		}
	}
	return false
}

func makeUniqueBidirectionalRules(rules []domain.ResolvedBypassRule) []domain.ResolvedBypassRule {
	var biRules []domain.ResolvedBypassRule
	seen := make(map[string]bool)

	for _, r := range rules {
		fwdKey := generateRuleKey(r.ShortcutPath, r.DetourPath)
		if !seen[fwdKey] {
			seen[fwdKey] = true
			biRules = append(biRules, r)
		}

		revShortcut := reverseSlice(r.ShortcutPath)
		revDetour := reverseSlice(r.DetourPath)
		revKey := generateRuleKey(revShortcut, revDetour)

		if !seen[revKey] {
			seen[revKey] = true
			biRules = append(biRules, domain.ResolvedBypassRule{
				ShortcutPath: revShortcut,
				DetourPath:   revDetour,
			})
		}
	}
	return biRules
}

func generateRuleKey(shortcut, detour []int) string {
	var sb strings.Builder
	sb.Grow((len(shortcut) + len(detour)) * 5)

	var buf [20]byte

	for i, id := range shortcut {
		if i > 0 {
			sb.WriteByte(',')
		}
		b := strconv.AppendInt(buf[:0], int64(id), 10)
		sb.Write(b)
	}

	sb.WriteByte('|')

	for i, id := range detour {
		if i > 0 {
			sb.WriteByte(',')
		}
		b := strconv.AppendInt(buf[:0], int64(id), 10)
		sb.Write(b)
	}

	return sb.String()
}

func reverseSlice(s []int) []int {
	res := make([]int, len(s))
	for i, v := range s {
		res[len(s)-1-i] = v
	}
	return res
}
