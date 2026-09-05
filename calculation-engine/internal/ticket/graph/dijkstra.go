package graph

import (
	"calculation-engine/internal/domain"
	"container/heap"
	"fmt"
	"sort"
	"sync"
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
	cost      domain.DeciKilo
	index     int
}

// priorityQueue は node の最小ヒープです。
type priorityQueue []*node

func (pq priorityQueue) Len() int           { return len(pq) }
func (pq priorityQueue) Less(i, j int) bool { return pq[i].cost < pq[j].cost }
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

// FindShortestPathGisei はダイクストラ法を用いて最短擬制キロ経路を検索します。
func (g *RailwayGraph) FindShortestPathGisei(startID, endID int) (*PathResult, error) {
	if startID < 0 || startID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGisei: %w: ID %d", domain.ErrStationNotFound, startID)
	}
	if endID < 0 || endID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGisei: %w: ID %d", domain.ErrStationNotFound, endID)
	}

	numStations := len(g.IDToName)

	if g.GetGroupID(startID) != g.GetGroupID(endID) {
		return nil, fmt.Errorf("FindShortestPathGisei: %w", domain.ErrNoPathExists)
	}

	dist := make([]domain.DeciKilo, numStations)
	for i := range dist {
		dist[i] = -1 // 未到達を-1で表現
	}

	prev := make([]int, numStations)
	for i := range prev {
		prev[i] = -1
	}

	eigyoDist := make([]domain.DeciKilo, numStations)

	pq := make(priorityQueue, 0)
	heap.Init(&pq)

	dist[startID] = 0
	eigyoDist[startID] = 0
	heap.Push(&pq, &node{
		stationID: startID,
		cost:      0,
	})

	for pq.Len() > 0 {
		u := heap.Pop(&pq).(*node)

		if u.stationID == endID {
			break
		}

		if dist[u.stationID] < u.cost {
			continue
		}

		if u.stationID >= len(g.Edges) {
			continue
		}

		for _, edge := range g.Edges[u.stationID] {
			v := edge.ToID
			alt := dist[u.stationID] + edge.GiseiKilo

			if dist[v] == -1 || alt < dist[v] {
				dist[v] = alt
				eigyoDist[v] = eigyoDist[u.stationID] + edge.EigyoKilo
				prev[v] = u.stationID
				heap.Push(&pq, &node{
					stationID: v,
					cost:      alt,
				})
			}
		}
	}

	if dist[endID] == -1 {
		return nil, fmt.Errorf("FindShortestPathGisei: %w", domain.ErrNoPathExists)
	}

	path := make([]int, 0)
	curr := endID
	for curr != -1 {
		path = append([]int{curr}, path...)
		curr = prev[curr]
	}

	return &PathResult{
		StationIDs: path,
		GiseiKilo:  dist[endID],
		EigyoKilo:  eigyoDist[endID],
	}, nil
}

func (g *RailwayGraph) FindAllShortestPathsGisei(startID int) ([]domain.DeciKilo, []int) {
	numStations := g.NumStations()
	dist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)
	for i := range dist {
		dist[i] = -1
		prev[i] = -1
	}

	dist[startID] = 0
	pq := make(priorityQueue, 0)
	heap.Init(&pq)
	heap.Push(&pq, &node{
		stationID: startID,
		cost:      0,
	})

	for pq.Len() > 0 {
		u := heap.Pop(&pq).(*node)

		if dist[u.stationID] != -1 && u.cost > dist[u.stationID] {
			continue
		}

		if u.stationID >= len(g.Edges) {
			continue
		}

		for _, edge := range g.Edges[u.stationID] {
			v := edge.ToID
			weight := edge.GiseiKilo
			alt := u.cost + weight

			if dist[v] == -1 || alt < dist[v] {
				dist[v] = alt
				prev[v] = u.stationID
				heap.Push(&pq, &node{
					stationID: v,
					cost:      alt,
				})
			}
		}
	}
	return dist, prev
}

// FindAllShortestPathsEigyo は指定した駅からの全駅への最短営業キロ経路をダイクストラ法で検索します。
func (g *RailwayGraph) FindAllShortestPathsEigyo(startID int) ([]domain.DeciKilo, []int) {
	numStations := len(g.IDToName)
	dist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)
	for i := 0; i < numStations; i++ {
		dist[i] = -1
		prev[i] = -1
	}

	dist[startID] = 0
	pq := make(priorityQueue, 0, numStations)
	heap.Push(&pq, &node{stationID: startID, cost: 0})

	for pq.Len() > 0 {
		u := heap.Pop(&pq).(*node)

		if u.cost > dist[u.stationID] {
			continue
		}

		for _, edge := range g.Edges[u.stationID] {
			newCost := dist[u.stationID] + edge.EigyoKilo
			if dist[edge.ToID] == -1 || newCost < dist[edge.ToID] {
				dist[edge.ToID] = newCost
				prev[edge.ToID] = u.stationID
				heap.Push(&pq, &node{stationID: edge.ToID, cost: newCost})
			} else if newCost == dist[edge.ToID] {
				// タイブレーク: 営業キロが同じ場合は擬制キロが短い方を優先
				uEigyo := g.getTieBreakerWeight(prev[edge.ToID], edge.ToID)
				newEigyo := g.getTieBreakerWeight(u.stationID, edge.ToID)
				if newEigyo < uEigyo {
					prev[edge.ToID] = u.stationID
				}
			}
		}
	}
	return dist, prev
}


func (g *RailwayGraph) getTieBreakerWeight(fromID, toID int) domain.DeciKilo {
	fromName := g.IDToName[fromID]
	toName := g.IDToName[toID]

	if (fromName == "南船橋" && toName == "西船橋") || (fromName == "西船橋" && toName == "南船橋") {
		return 10 // +1 km (+10 DeciKilo)
	}
	if (fromName == "千葉みなと" && toName == "蘇我") || (fromName == "蘇我" && toName == "千葉みなと") {
		return 10
	}
	if (fromName == "京終" && toName == "奈良") || (fromName == "奈良" && toName == "京終") {
		return 10
	}
	return 0
}

// FindShortestPathGiseiSuburban は対象の近郊区間に限定した最短擬制キロ経路を検索します。
func (g *RailwayGraph) FindShortestPathGiseiSuburban(startID, endID int, areaID domain.SuburbanAreaID) (*PathResult, error) {
	return g.FindShortestPathWithFilter(startID, endID, func(fromID, toID int, edge *domain.Edge) domain.DeciKilo {
		return edge.GiseiKilo + g.getTieBreakerWeight(fromID, toID)
	}, func(edge *domain.Edge) bool {
		return edge.SuburbanArea == areaID
	})
}

// FindShortestPathEigyoSuburban は対象の近郊区間に限定した最短営業キロ経路を検索します。
func (g *RailwayGraph) FindShortestPathEigyoSuburban(startID, endID int, areaID domain.SuburbanAreaID) (*PathResult, error) {
	return g.FindShortestPathWithFilter(startID, endID, func(fromID, toID int, edge *domain.Edge) domain.DeciKilo {
		return edge.EigyoKilo + g.getTieBreakerWeight(fromID, toID)
	}, func(edge *domain.Edge) bool {
		return edge.SuburbanArea == areaID
	})
}

// FindShortestPathEigyoTrainSpecific は電車特定区間に限定した最短営業キロ経路を検索します。
func (g *RailwayGraph) FindShortestPathEigyoTrainSpecific(startID, endID int) (*PathResult, error) {
	return g.FindShortestPathWithFilter(startID, endID, func(fromID, toID int, edge *domain.Edge) domain.DeciKilo {
		return edge.EigyoKilo + g.getTieBreakerWeight(fromID, toID)
	}, func(edge *domain.Edge) bool {
		return edge.IsTrainSpecificSection
	})
}

// FindShortestPathWithFilter はフィルタ条件を満たすエッジのみを対象とし、指定された重み関数でダイクストラ探索を行います。
func (g *RailwayGraph) FindShortestPathWithFilter(startID, endID int, weightFunc func(fromID, toID int, edge *domain.Edge) domain.DeciKilo, filterFunc func(edge *domain.Edge) bool) (*PathResult, error) {
	if startID < 0 || startID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathWithFilter: %w: ID %d", domain.ErrStationNotFound, startID)
	}
	if endID < 0 || endID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathWithFilter: %w: ID %d", domain.ErrStationNotFound, endID)
	}

	numStations := len(g.IDToName)

	if g.GetGroupID(startID) != g.GetGroupID(endID) {
		return nil, fmt.Errorf("FindShortestPathWithFilter: %w", domain.ErrNoPathExists)
	}

	dist := make([]domain.DeciKilo, numStations)
	for i := range dist {
		dist[i] = -1 // 未到達を-1で表現
	}

	prev := make([]int, numStations)
	for i := range prev {
		prev[i] = -1
	}

	pq := make(priorityQueue, 0)
	heap.Init(&pq)

	dist[startID] = 0
	heap.Push(&pq, &node{
		stationID: startID,
		cost:      0,
	})

	for pq.Len() > 0 {
		u := heap.Pop(&pq).(*node)

		if u.stationID == endID {
			break
		}

		if dist[u.stationID] < u.cost {
			continue
		}

		for _, e := range g.Edges[u.stationID] {
			if !filterFunc(&e.Edge) {
				continue
			}

			v := e.ToID
			w := weightFunc(u.stationID, v, &e.Edge)
			alt := dist[u.stationID] + w

			if dist[v] == -1 || alt < dist[v] {
				dist[v] = alt
				prev[v] = u.stationID
				heap.Push(&pq, &node{
					stationID: v,
					cost:      alt,
				})
			}
		}
	}

	if dist[endID] == -1 {
		return nil, fmt.Errorf("FindShortestPathWithFilter: %w", domain.ErrNoPathExists)
	}

	path := make([]int, 0)
	curr := endID
	for curr != -1 {
		path = append([]int{curr}, path...)
		curr = prev[curr]
	}

	// 実際の EigyoKilo と GiseiKilo は後続の運賃計算で算出するため、ここでは 0 を返す
	return &PathResult{
		StationIDs: path,
		GiseiKilo:  0,
		EigyoKilo:  0,
	}, nil
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
	rootGisei domain.DeciKilo, maxGisei domain.DeciKilo, precalcDistGisei []int16, endDistOffset int,
) (*PathResult, error) {
	if startID < 0 || startID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGiseiWithForbidden: %w: ID %d", domain.ErrStationNotFound, startID)
	}
	if endID < 0 || endID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGiseiWithForbidden: %w: ID %d", domain.ErrStationNotFound, endID)
	}

	if blockedNodes[startID] || blockedNodes[endID] {
		return nil, domain.ErrInvalidPath
	}

	if len(precalcDistGisei) > 0 && rootGisei+domain.DeciKilo(precalcDistGisei[endDistOffset+startID]) > maxGisei {
		return nil, domain.ErrInvalidPath
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
	heap.Push(pq, &node{stationID: startID, cost: 0})

	for pq.Len() > 0 {
		curr := heap.Pop(pq).(*node)

		if curr.stationID == endID {
			break
		}
		if curr.cost > dist[curr.stationID] {
			continue
		}

		if curr.stationID >= len(g.Edges) {
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

			newGisei := dist[curr.stationID] + edge.GiseiKilo
			if newGisei < dist[next] {
				// A* 枝刈り：rootGisei + ここまでの距離 + ここからゴールまでの最小予測距離 が maxGisei を超えるならキューに追加しない
				ok := len(precalcDistGisei) == 0 || rootGisei+newGisei+domain.DeciKilo(precalcDistGisei[endDistOffset+next]) <= maxGisei
				if ok {
					dist[next] = newGisei
					eigyoDist[next] = eigyoDist[curr.stationID] + edge.EigyoKilo
					prev[next] = curr.stationID
					heap.Push(pq, &node{stationID: edge.ToID, cost: newGisei})
				}
			}
		}
	}

	if prev[endID] == -1 && startID != endID {
		return nil, domain.ErrInvalidPath
	}

	// 経路の復元
	// 経路の復元
	pathLen := 0
	for i := endID; i != -1; i = prev[i] {
		pathLen++
	}
	path := pathSlicePool.Get().([]int)[:0]
	if cap(path) < pathLen {
		path = make([]int, 0, pathLen)
	}
	path = path[:pathLen]
	curr := endID
	for i := pathLen - 1; i >= 0; i-- {
		path[i] = curr
		curr = prev[curr]
	}

	return &PathResult{
		StationIDs: path,
		GiseiKilo:  dist[endID],
		EigyoKilo:  eigyoDist[endID],
	}, nil
}

var pathSlicePool = sync.Pool{
	New: func() interface{} {
		return make([]int, 0, 128)
	},
}

// YenScratch はYen's Algorithm用の再利用バッファです
type YenScratch struct {
	BlockedNodes []bool
	Dist         []domain.DeciKilo
	EigyoDist    []domain.DeciKilo
	Prev         []int
}

// FindUnboundedKShortestPathsGisei は、Yen's Algorithm を用いて、合計擬制キロが maxGisei 以下の最短経路をすべて探索します。
func (g *RailwayGraph) FindUnboundedKShortestPathsGisei(startID, endID int, maxGisei domain.DeciKilo) ([]*PathResult, error) {
	numStations := len(g.IDToName)
	scratch := &YenScratch{
		BlockedNodes: make([]bool, numStations),
		Dist:         make([]domain.DeciKilo, numStations),
		EigyoDist:    make([]domain.DeciKilo, numStations),
		Prev:         make([]int, numStations),
	}
	return g.FindUnboundedKShortestPathsGiseiWithScratch(startID, endID, maxGisei, scratch)
}

// FindUnboundedKShortestPathsGiseiWithScratch は再利用バッファを用いてYen's Algorithmを実行します
func (g *RailwayGraph) FindUnboundedKShortestPathsGiseiWithScratch(startID, endID int, maxGisei domain.DeciKilo, scratch *YenScratch) ([]*PathResult, error) {
	firstPath, err := g.FindShortestPathGisei(startID, endID)
	if err != nil {
		return nil, err
	}
	if firstPath.GiseiKilo > maxGisei {
		return nil, domain.ErrInvalidPath
	}

	A := []*PathResult{firstPath}
	var B []*PathResult

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
	blockedNodes := scratch.BlockedNodes
	for i := range blockedNodes {
		blockedNodes[i] = false
	}
	blockedEdges := make(map[uint64]bool)

	dist := scratch.Dist
	eigyoDist := scratch.EigyoDist
	prev := scratch.Prev

	endDistOffset := endID * numStations

	for ki := 1; ; ki++ {
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
				combinedLen := len(rootPath) + len(spurPathResult.StationIDs) - 1
				combinedIDs := pathSlicePool.Get().([]int)[:0]
				if cap(combinedIDs) < combinedLen {
					combinedIDs = make([]int, 0, combinedLen)
				}
				combinedIDs = combinedIDs[:combinedLen]
				copy(combinedIDs, rootPath)
				copy(combinedIDs[len(rootPath):], spurPathResult.StationIDs[1:])

				// 不要になったspurPathResultのStationIDsをプールに返却
				pathSlicePool.Put(spurPathResult.StationIDs[:0])

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

		// 候補Bをソート
		sort.Slice(B, func(i, j int) bool {
			return B[i].GiseiKilo < B[j].GiseiKilo
		})

		nextPath := B[0]
		A = append(A, nextPath)
		B = B[1:]
	}

	// Bに残った不要なパススライスをプールに返却
	for _, pr := range B {
		pathSlicePool.Put(pr.StationIDs[:0])
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
