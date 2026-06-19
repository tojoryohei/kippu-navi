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

// FindShortestPathGisei はダイクストラ法を用いて最短擬制キロ経路を検索します。
func (g *RailwayGraph) FindShortestPathGisei(startID, endID int) (*PathResult, error) {
	if startID < 0 || startID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGisei: %w: ID %d", domain.ErrStationNotFound, startID)
	}
	if endID < 0 || endID >= len(g.IDToName) {
		return nil, fmt.Errorf("FindShortestPathGisei: %w: ID %d", domain.ErrStationNotFound, endID)
	}

	numStations := len(g.IDToName)
	dist := make([]domain.DeciKilo, numStations)
	eigyoDist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)
	for i := range dist {
		dist[i] = domain.DeciKilo(1<<31 - 1) // math.MaxInt32
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

// FindAllShortestPathsGisei はダイクストラ法を用いて、開始駅から他のすべての駅への最短擬制キロ経路の距離と前移行配列を求めます。
func (g *RailwayGraph) FindAllShortestPathsGisei(startID int) ([]domain.DeciKilo, []int) {
	numStations := len(g.IDToName)
	dist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)
	for i := range dist {
		dist[i] = domain.DeciKilo(1<<31 - 1) // math.MaxInt32
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

// FindAllShortestPathsEigyo はダイクストラ法を用いて、開始駅から他のすべての駅への最短営業キロ経路の距離と前移行配列を求めます。
func (g *RailwayGraph) FindAllShortestPathsEigyo(startID int) ([]domain.DeciKilo, []int) {
	numStations := len(g.IDToName)
	dist := make([]domain.DeciKilo, numStations)
	prev := make([]int, numStations)
	for i := range dist {
		dist[i] = domain.DeciKilo(1<<31 - 1) // math.MaxInt32
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



