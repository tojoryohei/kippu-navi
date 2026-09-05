package split

import (
	"calculation-engine/internal/domain"
	"sync"
)

const (
	INF = 2147483647
	DefaultMaxSectionsLimit = 100
)

type StaticListNode struct {
	ParentIdx int
	Sections  int
	Next      int // 次のノードのインデックス。-1なら終端。
}

type DPScratch struct {
	StationToIndex  []int
	DistTable       []int
	HeadTable       []int
	Nodes           []StaticListNode
	PathBuf         []int
	NodeCount       int
	CandFlags       []bool
	CandStationsBuf []int
	LocalFares      []int
	AdjEdges        []int32
	AdjHead         []int32
}

func (s *DPScratch) EnsureSize(numStations int, maxK int, numCandidates int) {
	if len(s.StationToIndex) < numStations {
		s.StationToIndex = make([]int, numStations)
	}

	requiredDPSize := (maxK + 1) * numCandidates
	if len(s.DistTable) < requiredDPSize {
		s.DistTable = make([]int, requiredDPSize)
	}
	if len(s.HeadTable) < requiredDPSize {
		s.HeadTable = make([]int, requiredDPSize)
	}

	requiredNodesSize := requiredDPSize * 4
	if len(s.Nodes) < requiredNodesSize {
		s.Nodes = make([]StaticListNode, requiredNodesSize)
	}

	requiredPathBufSize := maxK + 2
	if len(s.PathBuf) < requiredPathBufSize {
		s.PathBuf = make([]int, requiredPathBufSize)
	}

	if len(s.CandFlags) < numStations {
		s.CandFlags = make([]bool, numStations)
	}
	if len(s.CandStationsBuf) < numStations {
		s.CandStationsBuf = make([]int, numStations)
	}

	requiredLocalSize := numCandidates * numCandidates
	if len(s.LocalFares) < requiredLocalSize {
		s.LocalFares = make([]int, requiredLocalSize)
	}
	if len(s.AdjEdges) < requiredLocalSize {
		s.AdjEdges = make([]int32, requiredLocalSize)
	}
	if len(s.AdjHead) < numCandidates+1 {
		s.AdjHead = make([]int32, numCandidates+1)
	}
}

var DPScratchPool = sync.Pool{
	New: func() interface{} {
		const maxN = 2500
		return &DPScratch{
			StationToIndex:  make([]int, 5000),
			DistTable:       make([]int, 101*maxN),
			HeadTable:       make([]int, 101*maxN),
			Nodes:           make([]StaticListNode, 101*maxN*4),
			PathBuf:         make([]int, 105),
			CandFlags:       make([]bool, 5000),
			CandStationsBuf: make([]int, 5000),
			LocalFares:      make([]int, maxN*maxN),
			AdjEdges:        make([]int32, maxN*maxN),
			AdjHead:         make([]int32, maxN+1),
		}
	},
}

// FareCalculator は、2駅間の運賃（コスト）を計算する関数の型です。
type FareCalculator func(startID, endID int) (int, error)

// SearchOptimalSplitDPMinimal は、動的計画法を用いて指定された候補駅から最適な分割点を見つけます。
func SearchOptimalSplitDPMinimal(startID, endID, maxSections int, candStations []int, getFare FareCalculator, scratch *DPScratch) (int, [][]int, error) {
	maxK := maxSections
	if maxSections <= 0 {
		maxK = len(candStations) - 1
		if maxK > DefaultMaxSectionsLimit {
			maxK = DefaultMaxSectionsLimit
		}
	}
	if maxK <= 0 {
		maxK = 1
	}
	if maxK > 100 {
		maxK = 100 // 安全装置
	}

	N := len(candStations)
	if N == 0 {
		return 0, nil, domain.ErrNoValidPattern
	}

	scratch.EnsureSize(len(scratch.CandFlags), maxK, N)

	for i := 0; i < len(scratch.StationToIndex); i++ {
		scratch.StationToIndex[i] = -1
	}
	for i, sid := range candStations {
		if sid < len(scratch.StationToIndex) {
			scratch.StationToIndex[sid] = i
		}
	}

	startIdx := -1
	endIdx := -1
	if startID < len(scratch.StationToIndex) {
		startIdx = scratch.StationToIndex[startID]
	}
	if endID < len(scratch.StationToIndex) {
		endIdx = scratch.StationToIndex[endID]
	}
	if startIdx == -1 || endIdx == -1 {
		return 0, nil, domain.ErrNoValidPattern
	}

	for i := 0; i < N*N; i++ {
		scratch.LocalFares[i] = 0
	}

	for i := 0; i <= maxK; i++ {
		offset := i * N
		for j := 0; j < N; j++ {
			scratch.DistTable[offset+j] = INF
			scratch.HeadTable[offset+j] = -1
		}
	}
	scratch.DistTable[0*N+startIdx] = 0
	scratch.NodeCount = 0

	for s := 0; s < maxK; s++ {
		for uIdx := 0; uIdx < N; uIdx++ {
			costU := scratch.DistTable[s*N+uIdx]
			if costU == INF {
				continue
			}

			if uIdx == endIdx {
				continue
			}

			for vIdx := 0; vIdx < N; vIdx++ {
				if uIdx == vIdx {
					continue
				}

				if scratch.LocalFares[uIdx*N+vIdx] == 0 {
					fare, err := getFare(candStations[uIdx], candStations[vIdx])
					if err == nil {
						scratch.LocalFares[uIdx*N+vIdx] = fare
					} else {
						scratch.LocalFares[uIdx*N+vIdx] = -1
					}
				}

				edgeCost := scratch.LocalFares[uIdx*N+vIdx]
				if edgeCost == -1 {
					continue
				}

				newCost := costU + edgeCost
				targetIdx := (s + 1) * N + vIdx

				if newCost < scratch.DistTable[targetIdx] {
					scratch.DistTable[targetIdx] = newCost
					
					if scratch.NodeCount >= len(scratch.Nodes) {
						newNodes := make([]StaticListNode, len(scratch.Nodes)*2)
						copy(newNodes, scratch.Nodes)
						scratch.Nodes = newNodes
					}

					scratch.Nodes[scratch.NodeCount] = StaticListNode{
						ParentIdx: uIdx,
						Sections:  s,
						Next:      -1,
					}
					scratch.HeadTable[targetIdx] = scratch.NodeCount
					scratch.NodeCount++
				} else if newCost == scratch.DistTable[targetIdx] {
					if scratch.NodeCount >= len(scratch.Nodes) {
						newNodes := make([]StaticListNode, len(scratch.Nodes)*2)
						copy(newNodes, scratch.Nodes)
						scratch.Nodes = newNodes
					}

					scratch.Nodes[scratch.NodeCount] = StaticListNode{
						ParentIdx: uIdx,
						Sections:  s,
						Next:      scratch.HeadTable[targetIdx],
					}
					scratch.HeadTable[targetIdx] = scratch.NodeCount
					scratch.NodeCount++
				}
			}
		}
	}

	minCostToEnd := INF
	for s := 1; s <= maxK; s++ {
		cost := scratch.DistTable[s*N+endIdx]
		if cost < minCostToEnd {
			minCostToEnd = cost
		}
	}

	if minCostToEnd == INF {
		return 0, nil, domain.ErrNoValidPattern
	}

	var optimalPaths [][]int
	for s := 1; s <= maxK; s++ {
		if scratch.DistTable[s*N+endIdx] == minCostToEnd {
			backtrackZeroAlloc(endIdx, s, scratch, 0, startIdx, candStations, N, &optimalPaths)
		}
	}

	if len(optimalPaths) == 0 {
		return 0, nil, domain.ErrNoValidPattern
	}

	return minCostToEnd, optimalPaths, nil
}

func backtrackZeroAlloc(
	currIdx, currS int,
	scratch *DPScratch,
	depth int,
	startIdx int,
	candStations []int,
	N int,
	optimalPaths *[][]int,
) {
	if depth >= len(scratch.PathBuf) {
		return
	}
	scratch.PathBuf[depth] = candStations[currIdx]

	if currIdx == startIdx && currS == 0 {
		path := make([]int, depth+1)
		for i := 0; i <= depth; i++ {
			path[i] = scratch.PathBuf[depth-i]
		}
		*optimalPaths = append(*optimalPaths, path)
		return
	}

	targetIdx := currS*N + currIdx
	nodeIdx := scratch.HeadTable[targetIdx]
	for nodeIdx != -1 {
		node := scratch.Nodes[nodeIdx]
		backtrackZeroAlloc(node.ParentIdx, node.Sections, scratch, depth+1, startIdx, candStations, N, optimalPaths)
		nodeIdx = node.Next
	}
}
