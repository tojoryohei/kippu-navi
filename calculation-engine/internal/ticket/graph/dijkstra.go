package graph

import (
	"calculation-engine/internal/domain"
	"container/heap"
	"fmt"
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
		giseiKilo: 0,
	})

	for pq.Len() > 0 {
		u := heap.Pop(&pq).(*node)

		if u.stationID == endID {
			break
		}

		if dist[u.stationID] < u.giseiKilo {
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
					giseiKilo: alt,
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
