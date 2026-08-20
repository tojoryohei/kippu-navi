package graph

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
)

// FastGraph は高速な探索に最適化された駅ネットワークを表します。
type FastGraph struct {
	Edges [][]ticketdomain.TicketEdge
}

// StationNameIDMapper は駅名(文字列)と数値ID間の変換を処理します。
type StationNameIDMapper struct {
	NameToID map[string]int
	IDToName []string
}

// StationProvider は駅名と数値IDの相互変換を処理するためのインターフェースです。
type StationProvider interface {
	GetID(name string) (int, bool)
	GetName(id int) string
	NumStations() int
	GetGroupID(id int) int
}

// TopologyProvider は駅間の接続情報を取得するためのインターフェースです。
type TopologyProvider interface {
	GetEdges(stationID int) []ticketdomain.TicketEdge
}

// PathFinder はグラフ上の経路探索を行うためのインターフェースです。
type PathFinder interface {
	FindShortestPathGisei(startID, endID int) (*PathResult, error)
}

// Graph は駅データとネットワーク構造を統合して管理するためのインターフェースです。
type Graph interface {
	StationProvider
	TopologyProvider
	PathFinder
	Validate() error
}

// RailwayGraph は Graph インターフェースの具象実装です。
type RailwayGraph struct {
	*FastGraph
	*StationNameIDMapper
	GroupIDs  []int // 連結成分ごとのグループID
	PrevGisei []int16
	DistGisei []int16
	DistEigyo []int16
}

// NewGraph は指定された初期容量で新しいグラフを作成します。
func NewGraph(capacity int) *RailwayGraph {
	return NewGraphWithMapper(capacity, &StationNameIDMapper{
		NameToID: make(map[string]int, capacity),
		IDToName: make([]string, 0, capacity),
	})
}

// NewGraphWithMapper は指定されたマッパーを共有する新しいグラフを作成します。
func NewGraphWithMapper(capacity int, mapper *StationNameIDMapper) *RailwayGraph {
	return &RailwayGraph{
		FastGraph: &FastGraph{
			Edges: make([][]ticketdomain.TicketEdge, 0, capacity),
		},
		StationNameIDMapper: mapper,
		GroupIDs:            make([]int, 0, capacity),
	}
}

// GetOrAddID は駅名からIDを取得し、存在しない場合は新しいIDを割り当てます。
func (g *RailwayGraph) GetOrAddID(name string) int {
	if id, exists := g.NameToID[name]; exists {
		return id
	}
	id := len(g.IDToName)
	g.NameToID[name] = id
	g.IDToName = append(g.IDToName, name)
	return id
}

// AddEdge はグラフに新しいエッジを追加します。
func (g *RailwayGraph) AddEdge(edge ticketdomain.TicketEdge) {
	from := edge.FromID
	for len(g.Edges) <= from {
		g.Edges = append(g.Edges, nil)
	}
	g.Edges[from] = append(g.Edges[from], edge)
}

// GetID は指定された駅名のIDを返します。
func (g *RailwayGraph) GetID(name string) (int, bool) {
	id, exists := g.NameToID[name]
	return id, exists
}

// GetName は指定されたIDの駅名を返します。
func (g *RailwayGraph) GetName(id int) string {
	if id < 0 || id >= len(g.IDToName) {
		return ""
	}
	return g.IDToName[id]
}

// NumStations はグラフ内の総駅数を返します。
func (g *RailwayGraph) NumStations() int {
	return len(g.IDToName)
}

// GetGroupID は指定されたIDの駅が属する連結成分のグループIDを返します。
func (g *RailwayGraph) GetGroupID(id int) int {
	if id < 0 || id >= len(g.GroupIDs) {
		return -1
	}
	return g.GroupIDs[id]
}

// GetEdges は指定された駅IDから伸びる全てのエッジを返します。
func (g *RailwayGraph) GetEdges(stationID int) []ticketdomain.TicketEdge {
	if stationID < 0 || stationID >= len(g.Edges) {
		return nil
	}
	return g.Edges[stationID]
}

// Validate はグラフの整合性を検証し、各駅のグループIDを計算します。
func (g *RailwayGraph) Validate() error {
	numStations := len(g.IDToName)
	if numStations == 0 {
		return domain.ErrEmptyGraph
	}

	g.GroupIDs = make([]int, numStations)
	for i := range g.GroupIDs {
		g.GroupIDs[i] = -1
	}

	currentGroupID := 0
	for i := 0; i < numStations; i++ {
		if g.GroupIDs[i] == -1 {
			g.bfsAssignGroup(i, currentGroupID)
			currentGroupID++
		}
	}

	return nil
}

func (g *RailwayGraph) bfsAssignGroup(startNode, groupID int) {
	queue := []int{startNode}
	g.GroupIDs[startNode] = groupID

	for len(queue) > 0 {
		node := queue[0]
		queue = queue[1:]

		for _, edge := range g.Edges[node] {
			neighbor := edge.ToID
			if g.GroupIDs[neighbor] == -1 {
				g.GroupIDs[neighbor] = groupID
				queue = append(queue, neighbor)
			}
		}
	}
}
