package graph

import (
	"container/heap"
	"fmt"
	"split-pass-api/internal/domain"
)

// PathResult は経路探索の結果を保持します。
type PathResult struct {
	StationIDs []int
	GiseiKilo  domain.DeciKilo
	EigyoKilo  domain.DeciKilo
}

// node はダイクストラ法で用いる優先度付きキューの要素です。
type node struct {
	stationID int
	giseiKilo domain.DeciKilo
	index     int
}

// priorityQueue は node の最小ヒープです。
type priorityQueue []*node

func (pq priorityQueue) Len() int           { return len(pq) }
func (pq priorityQueue) Less(i, j int) bool { return pq[i].giseiKilo < pq[j].giseiKilo }
func (pq priorityQueue) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}
func (pq *priorityQueue) Push(x interface{}) {
	n := len(*pq)
	item := x.(*node)
	item.index = n
	*pq = append(*pq, item)
}
func (pq *priorityQueue) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

// FindShortestPathGisei はダイクストラ法を用いて最短擬制キロ経路を検索します（事前計算データがあればダイクストラを回避します）。
func (g *RailwayGraph) FindShortestPathGisei(startID, endID int) (*PathResult, error) {
	if startID < 0 || startID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGisei: %w: ID %d", domain.ErrStationNotFound, startID)
	}
	if endID < 0 || endID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGisei: %w: ID %d", domain.ErrStationNotFound, endID)
	}

	numStations := len(g.IDToName)

	if len(g.PrevGisei) > 0 && len(g.DistGisei) > 0 && len(g.DistEigyo) > 0 {
		idx := startID*numStations + endID
		if g.PrevGisei[idx] == -1 && startID != endID {
			return nil, ErrPathNotFound
		}

		// 経路復元 (逆順トラバース)
		path := make([]int, 0, 64)
		curr := endID
		loopCount := 0
		for curr != startID {
			if curr == -1 || loopCount > numStations {
				return nil, ErrPathNotFound
			}
			path = append(path, curr)
			curr = int(g.PrevGisei[startID*numStations+curr])
			loopCount++
		}
		path = append(path, startID)

		// 逆順に並び替え
		for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
			path[i], path[j] = path[j], path[i]
		}

		return &PathResult{
			StationIDs: path,
			GiseiKilo:  domain.DeciKilo(g.DistGisei[idx]),
			EigyoKilo:  domain.DeciKilo(g.DistEigyo[idx]),
		}, nil
	}

	dist := make([]domain.DeciKilo, numStations)
	eigyoDist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)
	for i := range dist {
		dist[i] = domain.DeciKilo(65535)
		prev[i] = -1
	}

	dist[startID] = 0
	pq := &priorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &node{stationID: startID, giseiKilo: 0})

	for pq.Len() > 0 {
		curr := heap.Pop(pq).(*node)

		if curr.stationID == endID {
			break
		}
		if curr.giseiKilo > dist[curr.stationID] {
			continue
		}

		for _, edge := range g.Edges[curr.stationID] {
			newDist := dist[curr.stationID] + edge.GiseiKilo
			if newDist < dist[edge.ToID] {
				dist[edge.ToID] = newDist
				eigyoDist[edge.ToID] = eigyoDist[curr.stationID] + edge.EigyoKilo
				prev[edge.ToID] = curr.stationID
				heap.Push(pq, &node{stationID: edge.ToID, giseiKilo: newDist})
			}
		}
	}

	if prev[endID] == -1 && startID != endID {
		return nil, ErrPathNotFound
	}

	// 経路の復元
	path := []int{}
	for i := endID; i != -1; i = prev[i] {
		path = append([]int{i}, path...)
	}

	return &PathResult{
		StationIDs: path,
		GiseiKilo:  dist[endID],
		EigyoKilo:  eigyoDist[endID],
	}, nil
}

// FindAllShortestPathsGisei はダイクストラ法を用いて、開始駅から他のすべての駅への最短擬制キロ経路の距離と前移行配列を求めます（事前計算データがあればダイクストラを回避します）。
func (g *RailwayGraph) FindAllShortestPathsGisei(startID int) ([]domain.DeciKilo, []int) {
	numStations := len(g.IDToName)

	if len(g.PrevGisei) > 0 && len(g.DistGisei) > 0 {
		dist := make([]domain.DeciKilo, numStations)
		prev := make([]int, numStations)
		startIdx := startID * numStations
		for i := 0; i < numStations; i++ {
			dist[i] = domain.DeciKilo(g.DistGisei[startIdx+i])
			prev[i] = int(g.PrevGisei[startIdx+i])
		}
		return dist, prev
	}

	dist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)
	for i := range dist {
		dist[i] = domain.DeciKilo(65535)
		prev[i] = -1
	}

	dist[startID] = 0
	pq := &priorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &node{stationID: startID, giseiKilo: 0})

	for pq.Len() > 0 {
		curr := heap.Pop(pq).(*node)

		if curr.giseiKilo > dist[curr.stationID] {
			continue
		}

		for _, edge := range g.Edges[curr.stationID] {
			newDist := dist[curr.stationID] + edge.GiseiKilo
			if newDist < dist[edge.ToID] {
				dist[edge.ToID] = newDist
				prev[edge.ToID] = curr.stationID
				heap.Push(pq, &node{stationID: edge.ToID, giseiKilo: newDist})
			}
		}
	}
	return dist, prev
}

type nodeEigyo struct {
	stationID int
	eigyoKilo domain.DeciKilo
	index     int
}

type priorityQueueEigyo []*nodeEigyo

func (pq priorityQueueEigyo) Len() int           { return len(pq) }
func (pq priorityQueueEigyo) Less(i, j int) bool { return pq[i].eigyoKilo < pq[j].eigyoKilo }
func (pq priorityQueueEigyo) Swap(i, j int) {
	pq[i], pq[j] = pq[j], pq[i]
	pq[i].index = i
	pq[j].index = j
}
func (pq *priorityQueueEigyo) Push(x interface{}) {
	n := len(*pq)
	item := x.(*nodeEigyo)
	item.index = n
	*pq = append(*pq, item)
}
func (pq *priorityQueueEigyo) Pop() interface{} {
	old := *pq
	n := len(old)
	item := old[n-1]
	old[n-1] = nil
	item.index = -1
	*pq = old[0 : n-1]
	return item
}

// FindAllShortestPathsEigyo はダイクストラ法を用いて、開始駅から他のすべての駅への最短営業キロ経路の距離と前移行配列を求めます（事前計算データがあればダイクストラを回避します）。
func (g *RailwayGraph) FindAllShortestPathsEigyo(startID int) ([]domain.DeciKilo, []int) {
	numStations := len(g.IDToName)

	if len(g.PrevEigyo) > 0 && len(g.DistEigyo) > 0 {
		dist := make([]domain.DeciKilo, numStations)
		prev := make([]int, numStations)
		startIdx := startID * numStations
		for i := 0; i < numStations; i++ {
			dist[i] = domain.DeciKilo(g.DistEigyo[startIdx+i])
			prev[i] = int(g.PrevEigyo[startIdx+i])
		}
		return dist, prev
	}

	dist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)
	for i := range dist {
		dist[i] = domain.DeciKilo(65535)
		prev[i] = -1
	}

	dist[startID] = 0
	pq := &priorityQueueEigyo{}
	heap.Init(pq)
	heap.Push(pq, &nodeEigyo{stationID: startID, eigyoKilo: 0})

	for pq.Len() > 0 {
		curr := heap.Pop(pq).(*nodeEigyo)

		if curr.eigyoKilo > dist[curr.stationID] {
			continue
		}

		for _, edge := range g.Edges[curr.stationID] {
			newDist := dist[curr.stationID] + edge.EigyoKilo
			if newDist < dist[edge.ToID] {
				dist[edge.ToID] = newDist
				prev[edge.ToID] = curr.stationID
				heap.Push(pq, &nodeEigyo{stationID: edge.ToID, eigyoKilo: newDist})
			}
		}
	}
	return dist, prev
}

// FindShortestPathGiseiWithForbidden は、指定されたノードとエッジを避けて startID から endID までの最短擬制キロ経路を探索します。
// メモリアロケーションを避けるため、事前に確保された dist、eigyoDist、prev スライスを再利用します。
// また、A*的な枝刈りのため、rootGisei, maxGisei, およびバイナリから直接参照する distGisei と endDistOffset を使用します。
func (g *RailwayGraph) FindShortestPathGiseiWithForbidden(
	startID, endID int,
	blockedNodes []bool,
	blockedEdges map[uint64]bool,
	dist []domain.DeciKilo,
	eigyoDist []domain.DeciKilo,
	prev []int,
	rootGisei domain.DeciKilo,
	maxGisei domain.DeciKilo,
	distGisei []uint16,
	endDistOffset int,
) (*PathResult, error) {
	if startID < 0 || startID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGiseiWithForbidden: %w: ID %d", domain.ErrStationNotFound, startID)
	}
	if endID < 0 || endID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGiseiWithForbidden: %w: ID %d", domain.ErrStationNotFound, endID)
	}

	if blockedNodes[startID] || blockedNodes[endID] {
		return nil, ErrPathNotFound
	}

	if len(distGisei) > 0 && rootGisei+domain.DeciKilo(distGisei[endDistOffset+startID]) > maxGisei {
		return nil, ErrPathNotFound
	}

	numStations := len(g.IDToName)
	for i := 0; i < numStations; i++ {
		dist[i] = domain.DeciKilo(65535)
		prev[i] = -1
		eigyoDist[i] = 0
	}

	dist[startID] = 0
	pq := &priorityQueue{}
	heap.Init(pq)
	heap.Push(pq, &node{stationID: startID, giseiKilo: 0})

	for pq.Len() > 0 {
		curr := heap.Pop(pq).(*node)

		if curr.stationID == endID {
			break
		}
		if curr.giseiKilo > dist[curr.stationID] {
			continue
		}

		for _, edge := range g.Edges[curr.stationID] {
			next := edge.ToID
			if next < 0 || next >= numStations {
				continue
			}
			if blockedNodes[next] {
				continue
			}
			edgeKey := (uint64(curr.stationID) << 32) | uint64(next)
			if blockedEdges[edgeKey] {
				continue
			}

			newDist := dist[curr.stationID] + edge.GiseiKilo
			if newDist < dist[next] {
				// A* 枝刈り：rootGisei + ここまでの距離 + ここからゴールまでの最小予測距離 が maxGisei を超えるならキューに追加しない
				ok := len(distGisei) == 0 || rootGisei+newDist+domain.DeciKilo(distGisei[endDistOffset+next]) <= maxGisei
				if ok {
					dist[next] = newDist
					eigyoDist[next] = eigyoDist[curr.stationID] + edge.EigyoKilo
					prev[next] = curr.stationID
					heap.Push(pq, &node{stationID: next, giseiKilo: newDist})
				}
			}
		}
	}

	if prev[endID] == -1 && startID != endID {
		return nil, ErrPathNotFound
	}

	// 経路の復元
	path := []int{}
	for i := endID; i != -1; i = prev[i] {
		path = append([]int{i}, path...)
	}

	return &PathResult{
		StationIDs: path,
		GiseiKilo:  dist[endID],
		EigyoKilo:  eigyoDist[endID],
	}, nil
}

// FindKShortestPathsGisei は、Yen's Algorithm を用いて、合計擬制キロが maxGisei 以下の最短経路を最大 K 本探索します。
func (g *RailwayGraph) FindKShortestPathsGisei(startID, endID int, k int, maxGisei domain.DeciKilo) ([]*PathResult, error) {
	// 最初の最短経路
	firstPath, err := g.FindShortestPathGisei(startID, endID)
	if err != nil {
		return nil, err
	}
	if firstPath.GiseiKilo > maxGisei {
		return nil, ErrPathNotFound
	}

	A := []*PathResult{firstPath}
	var B []*PathResult

	// 経路が A または B にすでに存在するかチェックするヘルパー
	isPathEqual := func(p1, p2 []int) bool {
		if len(p1) != len(p2) {
			return false
		}
		for i := range p1 {
			if p1[i] != p2[i] {
				return false
			}
		}
		return true
	}
	containsPathResult := func(list []*PathResult, path []int) bool {
		for _, pr := range list {
			if isPathEqual(pr.StationIDs, path) {
				return true
			}
		}
		return false
	}

	numStations := len(g.IDToName)
	blockedNodes := make([]bool, numStations)
	blockedEdges := make(map[uint64]bool)

	// FindShortestPathGiseiWithForbidden 用の再利用スライス
	dist := make([]domain.DeciKilo, numStations)
	eigyoDist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)

	// ゴールからの距離をアロケーションゼロでバイナリから直接参照する
	endDistOffset := endID * numStations

	for ki := 1; ki < k; ki++ {
		prevPath := A[ki-1].StationIDs
		// 分岐ノード（spurNode）のループ：最初のノードから最後から2番目のノードまで
		for i := 0; i < len(prevPath)-1; i++ {
			spurNode := prevPath[i]
			rootPath := prevPath[0 : i+1]

			// ブロックリストの初期化
			for idx := range blockedNodes {
				blockedNodes[idx] = false
			}
			for edgeKey := range blockedEdges {
				delete(blockedEdges, edgeKey)
			}

			// 同じルートパスを共有する A 内の他の経路の一部であるエッジをブロックする
			for _, pathA := range A {
				p := pathA.StationIDs
				if len(p) > i+1 && isPathEqual(rootPath, p[0:i+1]) {
					edgeKey := (uint64(p[i]) << 32) | uint64(p[i+1])
					blockedEdges[edgeKey] = true
				}
			}

			// 分岐ノードを除くルートパス上のすべてのノードをブロックする
			for j := 0; j < len(rootPath)-1; j++ {
				blockedNodes[rootPath[j]] = true
			}

			// ルートパスの擬制キロを計算
			rootGiseiVal, _ := g.getPathKilos(rootPath)

			// 修正されたグラフ上で spurNode から endID への最短経路を探索
			spurPathResult, err := g.FindShortestPathGiseiWithForbidden(
				spurNode, endID, blockedNodes, blockedEdges, dist, eigyoDist, prev,
				rootGiseiVal, maxGisei, g.DistGisei, endDistOffset,
			)
			if err == nil {
				// ルートパスと分岐パスの結合
				combinedIDs := make([]int, len(rootPath)+len(spurPathResult.StationIDs)-1)
				copy(combinedIDs, rootPath)
				copy(combinedIDs[len(rootPath):], spurPathResult.StationIDs[1:])

				// 経路の擬制キロと営業キロの計算
				giseiVal, eigyoVal := g.getPathKilos(combinedIDs)

				if giseiVal <= maxGisei {
					if !containsPathResult(A, combinedIDs) && !containsPathResult(B, combinedIDs) {
						B = append(B, &PathResult{
							StationIDs: combinedIDs,
							GiseiKilo:  giseiVal,
							EigyoKilo:  eigyoVal,
						})
					}
				}
			}
		}

		if len(B) == 0 {
			break
		}

		// 最小の擬制キロを持つ経路のインデックスを探索
		bestIdx := 0
		for i := 1; i < len(B); i++ {
			if B[i].GiseiKilo < B[bestIdx].GiseiKilo {
				bestIdx = i
			}
		}

		nextPath := B[bestIdx]
		if nextPath.GiseiKilo > maxGisei {
			break
		}

		A = append(A, nextPath)
		B = append(B[:bestIdx], B[bestIdx+1:]...)
	}

	return A, nil
}

// getPathKilos は指定された経路の擬制キロと営業キロを計算します。
func (g *RailwayGraph) getPathKilos(path []int) (domain.DeciKilo, domain.DeciKilo) {
	var gisei, eigyo domain.DeciKilo
	for i := 0; i < len(path)-1; i++ {
		edges := g.Edges[path[i]]
		for _, edge := range edges {
			if edge.ToID == path[i+1] {
				gisei += edge.GiseiKilo
				eigyo += edge.EigyoKilo
				break
			}
		}
	}
	return gisei, eigyo
}
