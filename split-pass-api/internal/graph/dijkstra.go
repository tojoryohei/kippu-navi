package graph

import (
	"container/heap"
	"encoding/json"
	"errors"
	"fmt"
	"os"
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
func (g *Graph) FindShortestPathGisei(startID, endID int) (*PathResult, error) {
	if startID < 0 || startID >= len(g.IDToName) {
		return nil, fmt.Errorf("開始駅が見つかりません: ID %d", startID)
	}
	if endID < 0 || endID >= len(g.IDToName) {
		return nil, fmt.Errorf("目的駅が見つかりません: ID %d", endID)
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
		return nil, errors.New("経路が見つかりませんでした")
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

// FindAllCandidatePaths は指定された最短擬制キロ以内に収まる全ての合理的な経路を探索します。
// これにより、分割購入で安くなる可能性がある経路を網羅します。
func (g *Graph) FindAllCandidatePaths(startID, endID int, maxGisei domain.DeciKilo) ([]*PathResult, error) {
	if startID < 0 || startID >= len(g.IDToName) {
		return nil, fmt.Errorf("開始駅が見つかりません: ID %d", startID)
	}
	if endID < 0 || endID >= len(g.IDToName) {
		return nil, fmt.Errorf("目的駅が見つかりません: ID %d", endID)
	}

	var results []*PathResult
	visited := make([]bool, len(g.IDToName))

	// 探索中の状態を保持するスタック用の変数
	currentPath := []int{startID}
	visited[startID] = true

	var dfs func(currID int, currGisei, currEigyo domain.DeciKilo)
	dfs = func(currID int, currGisei, currEigyo domain.DeciKilo) {
		// 目的地に到達
		if currID == endID {
			pathIDs := make([]int, len(currentPath))
			copy(pathIDs, currentPath)
			results = append(results, &PathResult{
				StationIDs: pathIDs,
				GiseiKilo:  currGisei,
				EigyoKilo:  currEigyo,
			})
			return
		}

		// 隣接駅を探索
		for _, edge := range g.Edges[currID] {
			nextID := edge.ToID
			nextGisei := currGisei + edge.GiseiKilo
			nextEigyo := currEigyo + edge.EigyoKilo

			// 枝切り条件:
			// 1. 既に訪問済み（ループ防止）
			// 2. 累積擬制キロが制限(maxGisei)を超過
			if !visited[nextID] && nextGisei <= maxGisei {
				visited[nextID] = true
				currentPath = append(currentPath, nextID)

				dfs(nextID, nextGisei, nextEigyo)

				// バックトラッキング
				currentPath = currentPath[:len(currentPath)-1]
				visited[nextID] = false
			}
		}
	}

	dfs(startID, 0, 0)

	if len(results) == 0 {
		return nil, errors.New("候補経路が見つかりませんでした")
	}

	return results, nil
}


// LoadFromJSON は JSON ファイルからグラフを読み込みます。
func (g *Graph) LoadFromJSON(path string) error {
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()

	type rawEdge struct {
		Station0  string           `json:"station0"`
		Station1  string           `json:"station1"`
		EigyoKilo domain.DeciKilo  `json:"eigyoKilo"`
		GiseiKilo domain.DeciKilo  `json:"giseiKilo"`
		IsLocal   bool             `json:"isLocal"`
		Company   domain.CompanyID `json:"company"`
	}

	var edges []rawEdge
	if err := json.NewDecoder(file).Decode(&edges); err != nil {
		return err
	}

	for _, re := range edges {
		id0 := g.GetOrAddID(re.Station0)
		id1 := g.GetOrAddID(re.Station1)

		// 双方向エッジとして追加（鉄道網の場合、通常は双方向）
		g.AddEdge(domain.Edge{
			FromID:    id0,
			ToID:      id1,
			EigyoKilo: re.EigyoKilo,
			GiseiKilo: re.GiseiKilo,
			IsLocal:   re.IsLocal,
			Company:   re.Company,
		})
		g.AddEdge(domain.Edge{
			FromID:    id1,
			ToID:      id0,
			EigyoKilo: re.EigyoKilo,
			GiseiKilo: re.GiseiKilo,
			IsLocal:   re.IsLocal,
			Company:   re.Company,
		})
	}

	return nil
}
