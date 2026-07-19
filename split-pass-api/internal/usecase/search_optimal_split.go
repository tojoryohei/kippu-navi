package usecase

import (
	"errors"
	"fmt"
	"math"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"strconv"
	"strings"
	"sync"
)

const (
	// unreachableDistance は接続されておらず到達不可能なキロ数（無限大）を示します。
	unreachableDistance = domain.DeciKilo(65535)
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

// Execute は指定された発着駅間の最安分割結果を探索します。
func (u *SearchOptimalSplit) Execute(startID, endID, months int) ([][]int, error) {
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

	// 候補駅決定および探索用のスクラッチバッファをプールから調達
	numStations := int(u.numStations)
	scratch := dpScratchPool.Get().(*dpScratch)
	scratch.ensureSize(numStations, u.maxSections, numStations)

	// candFlags の初期化 (Zero-allocation)
	for i := 0; i < numStations; i++ {
		scratch.candFlags[i] = false
	}
	scratch.candFlags[startID] = true
	scratch.candFlags[endID] = true

	// 直接 DistGisei 参照により、FindAllShortestPathsGisei で発生する make(アロケーション) を回避
	rg := u.graph
	startOffset := startID * numStations
	endOffset := endID * numStations

	var dStartSlice []domain.DeciKilo
	var dEndSlice []domain.DeciKilo
	var useFallback = len(rg.DistGisei) == 0

	if useFallback {
		dStartSlice, _ = rg.FindAllShortestPathsGisei(startID)
		dEndSlice, _ = rg.FindAllShortestPathsGisei(endID)
	}

	for id := 0; id < numStations; id++ {
		var dStart, dEnd domain.DeciKilo
		if useFallback {
			dStart = dStartSlice[id]
			dEnd = dEndSlice[id]
		} else {
			dStart = domain.DeciKilo(rg.DistGisei[startOffset+id])
			dEnd = domain.DeciKilo(rg.DistGisei[endOffset+id])
		}

		if dStart == unreachableDistance || dEnd == unreachableDistance {
			continue
		}
		if dStart+dEnd <= maxGisei {
			scratch.candFlags[id] = true
		}
	}

	// 候補駅リストの平坦格納
	candLen := 0
	for id := 0; id < numStations; id++ {
		if scratch.candFlags[id] {
			scratch.candStationsBuf[candLen] = id
			candLen++
		}
	}
	candStations := scratch.candStationsBuf[:candLen]

	_, optimalPaths, err := u.searchOptimalSplitDPMinimal(startID, endID, months, u.maxSections, candStations, scratch)

	// プールへの返却
	dpScratchPool.Put(scratch)

	if err != nil {
		if errors.Is(err, domain.ErrNoValidPattern) {
			return [][]int{{startID, endID}}, nil
		}
		return nil, err
	}

	var results [][]int
	results = append(results, []int{startID, endID})

	for _, path := range optimalPaths {
		if len(path) == 2 && path[0] == startID && path[1] == endID {
			continue
		}
		results = append(results, path)
	}

	return results, nil
}

type staticListNode struct {
	parentIdx int
	sections  int
	next      int // 次のノードのインデックス。-1なら終端。
}

type dpScratch struct {
	stationToIndex  []int
	distTable       []int
	headTable       []int
	nodes           []staticListNode
	pathBuf         []int
	nodeCount       int
	candFlags       []bool
	candStationsBuf []int
	localFares      []int
	adjEdges        []int32
	adjHead         []int32
}

func (s *dpScratch) ensureSize(numStations int, maxK int, numCandidates int) {
	if len(s.stationToIndex) < numStations {
		s.stationToIndex = make([]int, numStations)
	}

	requiredDPSize := (maxK + 1) * numCandidates
	if len(s.distTable) < requiredDPSize {
		s.distTable = make([]int, requiredDPSize)
	}
	if len(s.headTable) < requiredDPSize {
		s.headTable = make([]int, requiredDPSize)
	}

	requiredNodesSize := requiredDPSize * 4
	if len(s.nodes) < requiredNodesSize {
		s.nodes = make([]staticListNode, requiredNodesSize)
	}

	requiredPathBufSize := maxK + 2
	if len(s.pathBuf) < requiredPathBufSize {
		s.pathBuf = make([]int, requiredPathBufSize)
	}

	if len(s.candFlags) < numStations {
		s.candFlags = make([]bool, numStations)
	}
	if len(s.candStationsBuf) < numStations {
		s.candStationsBuf = make([]int, numStations)
	}

	requiredLocalSize := numCandidates * numCandidates
	if len(s.localFares) < requiredLocalSize {
		s.localFares = make([]int, requiredLocalSize)
	}
	if len(s.adjEdges) < requiredLocalSize {
		s.adjEdges = make([]int32, requiredLocalSize)
	}
	if len(s.adjHead) < numCandidates+1 {
		s.adjHead = make([]int32, numCandidates+1)
	}
}

var dpScratchPool = sync.Pool{
	New: func() interface{} {
		return &dpScratch{
			stationToIndex:  make([]int, 5000),
			distTable:       make([]int, 101*500),
			headTable:       make([]int, 101*500),
			nodes:           make([]staticListNode, 101*500*4),
			pathBuf:         make([]int, 105),
			candFlags:       make([]bool, 5000),
			candStationsBuf: make([]int, 5000),
			localFares:      make([]int, 500*500),
			adjEdges:        make([]int32, 500*500),
			adjHead:         make([]int32, 501),
		}
	},
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

func (u *SearchOptimalSplit) searchOptimalSplitDP(startID, endID, months, maxSections int, candStations []int, scratch *dpScratch) ([]SplitResult, error) {
	numStations := int(u.numStations)

	maxK := maxSections
	if maxSections <= 0 {
		maxK = len(candStations) - 1
		if maxK > defaultMaxSectionsLimit {
			maxK = defaultMaxSectionsLimit
		}
	}

	mIdx := monthToIndex(months)
	N := len(candStations)

	scratch.ensureSize(numStations, maxK, N)
	scratch.nodeCount = 0

	// 逆写像テーブルの初期化
	for i := 0; i < numStations; i++ {
		scratch.stationToIndex[i] = -1
	}
	for i, sid := range candStations {
		scratch.stationToIndex[sid] = i
	}

	startIdx := scratch.stationToIndex[startID]
	endIdx := scratch.stationToIndex[endID]
	if startIdx == -1 || endIdx == -1 {
		return nil, domain.ErrNoValidPattern
	}

	// DPテーブルの初期化
	const INF = math.MaxInt
	dpSize := (maxK + 1) * N
	for i := 0; i < dpSize; i++ {
		scratch.distTable[i] = INF
		scratch.headTable[i] = -1
	}

	// 初期状態の設定
	scratch.distTable[0*N+startIdx] = 0

	if N <= 500 {
		// CSR と Local Matrix の構築 (アロケーションフリー)
		edgeCount := 0
		scratch.adjHead[0] = 0

		for uIdx := 0; uIdx < N; uIdx++ {
			currID := candStations[uIdx]
			baseIdx := int32(mIdx)*u.numStations*u.numStations + int32(currID)*u.numStations
			uOffset := uIdx * N

			for vIdx := 0; vIdx < N; vIdx++ {
				if uIdx == vIdx {
					scratch.localFares[uOffset+vIdx] = 0
					continue
				}

				nextID := candStations[vIdx]
				fareVal := int(u.fares[baseIdx+int32(nextID)])
				scratch.localFares[uOffset+vIdx] = fareVal

				if fareVal > 0 {
					scratch.adjEdges[edgeCount] = int32(vIdx)
					edgeCount++
				}
			}
			scratch.adjHead[uIdx+1] = int32(edgeCount)
		}

		// BCE (Bounds Check Elimination) 用ダミーアクセス
		_ = scratch.distTable[maxK*N+N-1]
		_ = scratch.headTable[maxK*N+N-1]
		_ = scratch.localFares[N*N-1]
		_ = scratch.adjHead[N]
		if edgeCount > 0 {
			_ = scratch.adjEdges[edgeCount-1]
		}

		// 多ステージ DP 遷移 (CSR + Local Matrix 形式)
		for s := 0; s < maxK; s++ {
			for uIdx := 0; uIdx < N; uIdx++ {
				currCost := scratch.distTable[s*N+uIdx]
				if currCost == INF {
					continue
				}

				startEdgeIdx := int(scratch.adjHead[uIdx])
				endEdgeIdx := int(scratch.adjHead[uIdx+1])
				uOffset := uIdx * N

				for e := startEdgeIdx; e < endEdgeIdx; e++ {
					vIdx := int(scratch.adjEdges[e])
					fareVal := scratch.localFares[uOffset+vIdx]

					newCost := currCost + fareVal
					targetIdx := (s+1)*N + vIdx

					if newCost < scratch.distTable[targetIdx] {
						scratch.distTable[targetIdx] = newCost

						if scratch.nodeCount >= len(scratch.nodes) {
							newNodes := make([]staticListNode, len(scratch.nodes)*2)
							copy(newNodes, scratch.nodes)
							scratch.nodes = newNodes
						}

						scratch.nodes[scratch.nodeCount] = staticListNode{
							parentIdx: uIdx,
							sections:  s,
							next:      -1,
						}
						scratch.headTable[targetIdx] = scratch.nodeCount
						scratch.nodeCount++
					} else if newCost == scratch.distTable[targetIdx] {
						if scratch.nodeCount >= len(scratch.nodes) {
							newNodes := make([]staticListNode, len(scratch.nodes)*2)
							copy(newNodes, scratch.nodes)
							scratch.nodes = newNodes
						}

						scratch.nodes[scratch.nodeCount] = staticListNode{
							parentIdx: uIdx,
							sections:  s,
							next:      scratch.headTable[targetIdx],
						}
						scratch.headTable[targetIdx] = scratch.nodeCount
						scratch.nodeCount++
					}
				}
			}
		}
	} else {
		// フォールバック: N > 500 の場合の直接参照方式
		for s := 0; s < maxK; s++ {
			for uIdx := 0; uIdx < N; uIdx++ {
				currCost := scratch.distTable[s*N+uIdx]
				if currCost == INF {
					continue
				}

				currID := candStations[uIdx]
				baseIdx := int32(mIdx)*u.numStations*u.numStations + int32(currID)*u.numStations

				for vIdx := 0; vIdx < N; vIdx++ {
					if uIdx == vIdx {
						continue
					}

					nextID := candStations[vIdx]
					idx := baseIdx + int32(nextID)
					fareVal := int(u.fares[idx])
					if fareVal <= 0 {
						continue
					}

					newCost := currCost + fareVal
					targetIdx := (s+1)*N + vIdx

					if newCost < scratch.distTable[targetIdx] {
						scratch.distTable[targetIdx] = newCost

						if scratch.nodeCount >= len(scratch.nodes) {
							newNodes := make([]staticListNode, len(scratch.nodes)*2)
							copy(newNodes, scratch.nodes)
							scratch.nodes = newNodes
						}

						scratch.nodes[scratch.nodeCount] = staticListNode{
							parentIdx: uIdx,
							sections:  s,
							next:      -1,
						}
						scratch.headTable[targetIdx] = scratch.nodeCount
						scratch.nodeCount++
					} else if newCost == scratch.distTable[targetIdx] {
						if scratch.nodeCount >= len(scratch.nodes) {
							newNodes := make([]staticListNode, len(scratch.nodes)*2)
							copy(newNodes, scratch.nodes)
							scratch.nodes = newNodes
						}

						scratch.nodes[scratch.nodeCount] = staticListNode{
							parentIdx: uIdx,
							sections:  s,
							next:      scratch.headTable[targetIdx],
						}
						scratch.headTable[targetIdx] = scratch.nodeCount
						scratch.nodeCount++
					}
				}
			}
		}
	}

	// 最小コストの探索
	minCostToEnd := INF
	for s := 1; s <= maxK; s++ {
		cost := scratch.distTable[s*N+endIdx]
		if cost < minCostToEnd {
			minCostToEnd = cost
		}
	}

	if minCostToEnd == INF {
		return nil, domain.ErrNoValidPattern
	}

	// 最安コストを達成する状態からバックトラックして全経路を抽出
	var optimalPaths [][]int
	for s := 1; s <= maxK; s++ {
		if scratch.distTable[s*N+endIdx] == minCostToEnd {
			u.backtrackZeroAlloc(endIdx, s, scratch, 0, startIdx, candStations, N, &optimalPaths)
		}
	}

	if len(optimalPaths) == 0 {
		return nil, domain.ErrNoValidPattern
	}

	// 各パスについて、セグメントの実際の中間経路を動的に復元
	var results []SplitResult
	for _, path := range optimalPaths {
		var allSegCandidates [][]SplitSegment
		isValid := true
		for i := 0; i < len(path)-1; i++ {
			segs, err := u.GetCheapestNoSplitSegments(path[i], path[i+1], months)
			if err != nil {
				isValid = false
				break
			}
			allSegCandidates = append(allSegCandidates, segs)
		}
		if isValid {
			combinations := generateCombinations(allSegCandidates)
			for _, combo := range combinations {
				results = append(results, SplitResult{
					TotalAmount: minCostToEnd,
					Segments:    combo,
				})
			}
		}
	}

	if len(results) == 0 {
		return nil, domain.ErrNoValidPattern
	}

	return results, nil
}

func (u *SearchOptimalSplit) backtrackZeroAlloc(
	currIdx, currS int,
	scratch *dpScratch,
	depth int,
	startIdx int,
	candStations []int,
	N int,
	optimalPaths *[][]int,
) {
	if depth >= len(scratch.pathBuf) {
		return
	}
	scratch.pathBuf[depth] = candStations[currIdx]

	if currIdx == startIdx && currS == 0 {
		path := make([]int, depth+1)
		for i := 0; i <= depth; i++ {
			path[i] = scratch.pathBuf[depth-i]
		}
		*optimalPaths = append(*optimalPaths, path)
		return
	}

	targetIdx := currS*N + currIdx
	nodeIdx := scratch.headTable[targetIdx]
	for nodeIdx != -1 {
		node := scratch.nodes[nodeIdx]
		u.backtrackZeroAlloc(node.parentIdx, node.sections, scratch, depth+1, startIdx, candStations, N, optimalPaths)
		nodeIdx = node.next
	}
}

func (u *SearchOptimalSplit) GetCheapestNoSplitSegments(start, end, months int) ([]SplitSegment, error) {
	shortest, err := u.graph.FindShortestPathGisei(start, end)
	if err != nil {
		return nil, domain.ErrInvalidPath
	}
	maxGisei := shortest.GiseiKilo + 50

	pathsResult, err := u.graph.FindKShortestPathsGisei(start, end, 10, maxGisei)
	if err != nil {
		return nil, domain.ErrInvalidPath
	}

	dfsPaths := make([][]int, len(pathsResult))
	for i, pr := range pathsResult {
		dfsPaths[i] = pr.StationIDs
	}

	bypassPaths := u.getBypassCandidates(start, end)

	allPaths := append(dfsPaths, bypassPaths...)

	var validPaths [][]int
	for _, path := range allPaths {
		if !u.checkMixedRouteConflict(path) {
			continue
		}
		if u.isPureDetourPath(path) {
			continue
		}
		if !containsPath(validPaths, path) {
			validPaths = append(validPaths, path)
		}
	}

	if len(validPaths) == 0 {
		return nil, domain.ErrInvalidPath
	}

	minFare := math.MaxInt
	var bestPaths [][]int
	var bestResults []*CalculationResult

	for _, path := range validPaths {
		res, err := u.split.calc.Execute(path, months)
		if err != nil {
			continue
		}
		fare := res.TotalAmount()
		if fare < minFare {
			minFare = fare
			bestPaths = [][]int{path}
			bestResults = []*CalculationResult{res}
		} else if fare == minFare {
			if !containsPath(bestPaths, path) {
				bestPaths = append(bestPaths, path)
				bestResults = append(bestResults, res)
			}
		}
	}

	if minFare == math.MaxInt {
		return nil, domain.ErrInvalidPath
	}

	var segs []SplitSegment
	for i, path := range bestPaths {
		segs = append(segs, SplitSegment{
			Path:           path,
			Result:         bestResults[i],
			StartStationID: start,
			EndStationID:   end,
		})
	}

	return segs, nil
}

func (u *SearchOptimalSplit) checkMixedRouteConflict(path []int) bool {
	pathSet := make(map[int]bool, len(path))
	for _, sid := range path {
		pathSet[sid] = true
	}

	for _, rule := range u.rules {
		hasShortcutInner := false
		if len(rule.ShortcutPath) > 2 {
			for i := 1; i < len(rule.ShortcutPath)-1; i++ {
				if pathSet[rule.ShortcutPath[i]] {
					hasShortcutInner = true
					break
				}
			}
		}

		if !hasShortcutInner {
			continue
		}

		hasAllDetour := true
		for _, detID := range rule.DetourPath {
			if !pathSet[detID] {
				hasAllDetour = false
				break
			}
		}

		if hasShortcutInner && hasAllDetour {
			return false
		}
	}
	return true
}

func containsSubslice(slice []int, target []int) bool {
	n := len(slice)
	m := len(target)
	if m == 0 || n < m {
		return false
	}
	for i := 0; i <= n-m; i++ {
		match := true
		for j := 0; j < m; j++ {
			if slice[i+j] != target[j] {
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

func (u *SearchOptimalSplit) isPureDetourPath(path []int) bool {
	for _, rule := range u.rules {
		hasInnerShortcut := false
		if len(rule.ShortcutPath) > 2 {
			inner := rule.ShortcutPath[1 : len(rule.ShortcutPath)-1]
			for _, sID := range inner {
				for _, pID := range path {
					if sID == pID {
						hasInnerShortcut = true
						break
					}
				}
				if hasInnerShortcut {
					break
				}
			}
		}

		if hasInnerShortcut {
			continue
		}

		if containsSubslice(path, rule.DetourPath) || containsSubslice(path, reverseSlice(rule.DetourPath)) {
			return true
		}
	}
	return false
}


func (u *SearchOptimalSplit) getBypassCandidates(start, end int) [][]int {
	rg := u.graph
	var cands [][]int

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
				break // 特例区間内での双方向重複生成を遮断
			}
		}
	}

	for _, rule := range u.rules {
		startOnDetour := u.isOnDetourMiddle(start, rule)
		endOnDetour := u.isOnDetourMiddle(end, rule)

		if startOnDetour {
			pathJ2ToEnd, err := rg.FindShortestPathGisei(rule.ShortcutPath[len(rule.ShortcutPath)-1], end)
			if err == nil && len(pathJ2ToEnd.StationIDs) >= 2 {
				cand := append([]int(nil), rule.ShortcutPath...)
				cand = append(cand, pathJ2ToEnd.StationIDs[1:]...)
				cands = append(cands, cand)
			}

			pathJ1ToEnd, err := rg.FindShortestPathGisei(rule.ShortcutPath[0], end)
			if err == nil && len(pathJ1ToEnd.StationIDs) >= 2 {
				revShortcut := reverseSlice(rule.ShortcutPath)
				cand := append([]int(nil), revShortcut...)
				cand = append(cand, pathJ1ToEnd.StationIDs[1:]...)
				cands = append(cands, cand)
			}
		}

		if endOnDetour {
			pathStartToJ1, err := rg.FindShortestPathGisei(start, rule.ShortcutPath[0])
			if err == nil && len(pathStartToJ1.StationIDs) >= 2 {
				cand := append([]int(nil), pathStartToJ1.StationIDs...)
				cand = append(cand, rule.ShortcutPath[1:]...)
				cands = append(cands, cand)
			}

			pathStartToJ2, err := rg.FindShortestPathGisei(start, rule.ShortcutPath[len(rule.ShortcutPath)-1])
			if err == nil && len(pathStartToJ2.StationIDs) >= 2 {
				revShortcut := reverseSlice(rule.ShortcutPath)
				cand := append([]int(nil), pathStartToJ2.StationIDs...)
				cand = append(cand, revShortcut[1:]...)
				cands = append(cands, cand)
			}
		}
	}

	return cands
}

func containsPath(paths [][]int, target []int) bool {
	for _, p := range paths {
		if len(p) != len(target) {
			continue
		}
		match := true
		for i := range p {
			if p[i] != target[i] {
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

func generateCombinations(candidates [][]SplitSegment) [][]SplitSegment {
	if len(candidates) == 0 {
		return [][]SplitSegment{{}}
	}

	var result [][]SplitSegment
	var helper func(index int, current []SplitSegment)
	helper = func(index int, current []SplitSegment) {
		if index == len(candidates) {
			combo := make([]SplitSegment, len(current))
			copy(combo, current)
			result = append(result, combo)
			return
		}

		for _, seg := range candidates[index] {
			helper(index+1, append(current, seg))
		}
	}

	helper(0, nil)
	return result
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

// RunBenchmarkDPForTest は外部ベンチマークテストから内部DP処理を直接実行するためのテスト専用メソッドです。
func (u *SearchOptimalSplit) RunBenchmarkDPForTest(startID, endID, months int, maxSections int, candStations []int, scratch interface{}) error {
	sc := scratch.(*dpScratch)
	_, err := u.searchOptimalSplitDP(startID, endID, months, maxSections, candStations, sc)
	return err
}

// GetDPScratchForTest は内部の dpScratchPool から scratch 領域を取得します。
func GetDPScratchForTest() interface{} {
	return dpScratchPool.Get()
}

// PutDPScratchForTest は scratch 領域を dpScratchPool に戻します。
func PutDPScratchForTest(scratch interface{}) {
	dpScratchPool.Put(scratch)
}

// EnsureSizeForTest は scratch のサイズを確認・確保します。
func EnsureSizeForTest(scratch interface{}, numStations, maxK, numCandidates int) {
	sc := scratch.(*dpScratch)
	sc.ensureSize(numStations, maxK, numCandidates)
}

// GetCandFlagsForTest は scratch の candFlags スライスを返します。
func GetCandFlagsForTest(scratch interface{}) []bool {
	return scratch.(*dpScratch).candFlags
}

// GetCandStationsBufForTest は scratch の candStationsBuf スライスを返します。
func GetCandStationsBufForTest(scratch interface{}) []int {
	return scratch.(*dpScratch).candStationsBuf
}

func (u *SearchOptimalSplit) searchOptimalSplitDPMinimal(startID, endID, months, maxSections int, candStations []int, scratch *dpScratch) (int, [][]int, error) {
	numStations := int(u.numStations)

	maxK := maxSections
	if maxSections <= 0 {
		maxK = len(candStations) - 1
		if maxK > defaultMaxSectionsLimit {
			maxK = defaultMaxSectionsLimit
		}
	}

	mIdx := monthToIndex(months)
	N := len(candStations)

	scratch.ensureSize(numStations, maxK, N)
	scratch.nodeCount = 0

	// 逆写像テーブルの初期化
	for i := 0; i < numStations; i++ {
		scratch.stationToIndex[i] = -1
	}
	for i, sid := range candStations {
		scratch.stationToIndex[sid] = i
	}

	startIdx := scratch.stationToIndex[startID]
	endIdx := scratch.stationToIndex[endID]
	if startIdx == -1 || endIdx == -1 {
		return 0, nil, domain.ErrNoValidPattern
	}

	// DPテーブルの初期化
	const INF = math.MaxInt
	dpSize := (maxK + 1) * N
	for i := 0; i < dpSize; i++ {
		scratch.distTable[i] = INF
		scratch.headTable[i] = -1
	}

	// 初期状態の設定
	scratch.distTable[0*N+startIdx] = 0

	if N <= 500 {
		// CSR と Local Matrix の構築 (アロケーションフリー)
		edgeCount := 0
		scratch.adjHead[0] = 0

		for uIdx := 0; uIdx < N; uIdx++ {
			currID := candStations[uIdx]
			baseIdx := int32(mIdx)*u.numStations*u.numStations + int32(currID)*u.numStations
			uOffset := uIdx * N

			for vIdx := 0; vIdx < N; vIdx++ {
				if uIdx == vIdx {
					scratch.localFares[uOffset+vIdx] = 0
					continue
				}

				nextID := candStations[vIdx]
				fareVal := int(u.fares[baseIdx+int32(nextID)])
				scratch.localFares[uOffset+vIdx] = fareVal

				if fareVal > 0 {
					scratch.adjEdges[edgeCount] = int32(vIdx)
					edgeCount++
				}
			}
			scratch.adjHead[uIdx+1] = int32(edgeCount)
		}

		// 多ステージ DP 遷移 (CSR + Local Matrix 形式)
		for s := 0; s < maxK; s++ {
			for uIdx := 0; uIdx < N; uIdx++ {
				currCost := scratch.distTable[s*N+uIdx]
				if currCost == INF {
					continue
				}

				startEdgeIdx := int(scratch.adjHead[uIdx])
				endEdgeIdx := int(scratch.adjHead[uIdx+1])
				uOffset := uIdx * N

				for e := startEdgeIdx; e < endEdgeIdx; e++ {
					vIdx := int(scratch.adjEdges[e])
					fareVal := scratch.localFares[uOffset+vIdx]

					newCost := currCost + fareVal
					targetIdx := (s+1)*N + vIdx

					if newCost < scratch.distTable[targetIdx] {
						scratch.distTable[targetIdx] = newCost

						if scratch.nodeCount >= len(scratch.nodes) {
							newNodes := make([]staticListNode, len(scratch.nodes)*2)
							copy(newNodes, scratch.nodes)
							scratch.nodes = newNodes
						}

						scratch.nodes[scratch.nodeCount] = staticListNode{
							parentIdx: uIdx,
							sections:  s,
							next:      -1,
						}
						scratch.headTable[targetIdx] = scratch.nodeCount
						scratch.nodeCount++
					} else if newCost == scratch.distTable[targetIdx] {
						if scratch.nodeCount >= len(scratch.nodes) {
							newNodes := make([]staticListNode, len(scratch.nodes)*2)
							copy(newNodes, scratch.nodes)
							scratch.nodes = newNodes
						}

						scratch.nodes[scratch.nodeCount] = staticListNode{
							parentIdx: uIdx,
							sections:  s,
							next:      scratch.headTable[targetIdx],
						}
						scratch.headTable[targetIdx] = scratch.nodeCount
						scratch.nodeCount++
					}
				}
			}
		}
	} else {
		// フォールバック: N > 500 の場合の直接参照方式
		for s := 0; s < maxK; s++ {
			for uIdx := 0; uIdx < N; uIdx++ {
				currCost := scratch.distTable[s*N+uIdx]
				if currCost == INF {
					continue
				}

				currID := candStations[uIdx]
				baseIdx := int32(mIdx)*u.numStations*u.numStations + int32(currID)*u.numStations

				for vIdx := 0; vIdx < N; vIdx++ {
					if uIdx == vIdx {
						continue
					}

					nextID := candStations[vIdx]
					idx := baseIdx + int32(nextID)
					fareVal := int(u.fares[idx])
					if fareVal <= 0 {
						continue
					}

					newCost := currCost + fareVal
					targetIdx := (s+1)*N + vIdx

					if newCost < scratch.distTable[targetIdx] {
						scratch.distTable[targetIdx] = newCost

						if scratch.nodeCount >= len(scratch.nodes) {
							newNodes := make([]staticListNode, len(scratch.nodes)*2)
							copy(newNodes, scratch.nodes)
							scratch.nodes = newNodes
						}

						scratch.nodes[scratch.nodeCount] = staticListNode{
							parentIdx: uIdx,
							sections:  s,
							next:      -1,
						}
						scratch.headTable[targetIdx] = scratch.nodeCount
						scratch.nodeCount++
					} else if newCost == scratch.distTable[targetIdx] {
						if scratch.nodeCount >= len(scratch.nodes) {
							newNodes := make([]staticListNode, len(scratch.nodes)*2)
							copy(newNodes, scratch.nodes)
							scratch.nodes = newNodes
						}

						scratch.nodes[scratch.nodeCount] = staticListNode{
							parentIdx: uIdx,
							sections:  s,
							next:      scratch.headTable[targetIdx],
						}
						scratch.headTable[targetIdx] = scratch.nodeCount
						scratch.nodeCount++
					}
				}
			}
		}
	}

	// 最小コストの探索
	minCostToEnd := INF
	for s := 1; s <= maxK; s++ {
		cost := scratch.distTable[s*N+endIdx]
		if cost < minCostToEnd {
			minCostToEnd = cost
		}
	}

	if minCostToEnd == INF {
		return 0, nil, domain.ErrNoValidPattern
	}

	// 最安コストを達成する状態からバックトラックして全分割経路を抽出
	var optimalPaths [][]int
	for s := 1; s <= maxK; s++ {
		if scratch.distTable[s*N+endIdx] == minCostToEnd {
			u.backtrackZeroAlloc(endIdx, s, scratch, 0, startIdx, candStations, N, &optimalPaths)
		}
	}

	if len(optimalPaths) == 0 {
		return 0, nil, domain.ErrNoValidPattern
	}

	return minCostToEnd, optimalPaths, nil
}
