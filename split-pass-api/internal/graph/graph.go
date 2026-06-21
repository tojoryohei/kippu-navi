package graph

import (
	"split-pass-api/internal/domain"
)

// FastGraph は高速な探索に最適化された駅ネットワークを表します。
type FastGraph struct {
	Edges [][]domain.Edge
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
	GetEdges(stationID int) []domain.Edge
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
	PrevEigyo []int16
	DistGisei []uint16
	DistEigyo []uint16
}

// NewGraph は空のグラフインスタンスを作成します。
func NewGraph(numStations int) *RailwayGraph {
	return &RailwayGraph{
		FastGraph:           NewFastGraph(numStations),
		StationNameIDMapper: NewStationNameIDMapper(),
	}
}

// GetGroupID は指定された駅IDのグループIDを返します。
// 設定されていない場合や範囲外の場合はデフォルト値として 1 を返します。
func (g *RailwayGraph) GetGroupID(id int) int {
	if g.GroupIDs == nil || id < 0 || id >= len(g.GroupIDs) {
		return 1 // ベースグラフなどのデフォルト挙動
	}
	return g.GroupIDs[id]
}

// NewFastGraph は指定された駅数の容量を持つ新しい FastGraph インスタンスを作成します。
func NewFastGraph(numStations int) *FastGraph {
	return &FastGraph{
		Edges: make([][]domain.Edge, numStations),
	}
}

// GetEdges は指定された駅IDに隣接するエッジのリストを返します。
func (g *FastGraph) GetEdges(id int) []domain.Edge {
	if id < 0 || id >= len(g.Edges) {
		return nil
	}
	return g.Edges[id]
}

// AddEdge は駅間に有向エッジを追加します。
func (g *FastGraph) AddEdge(edge domain.Edge) {
	// 必要に応じてスライスを拡張
	maxID := edge.FromID
	if edge.ToID > maxID {
		maxID = edge.ToID
	}
	if maxID >= len(g.Edges) {
		newEdges := make([][]domain.Edge, maxID+1)
		copy(newEdges, g.Edges)
		g.Edges = newEdges
	}
	g.Edges[edge.FromID] = append(g.Edges[edge.FromID], edge)
}

// NewStationNameIDMapper は新しいマッパーを作成します。
func NewStationNameIDMapper() *StationNameIDMapper {
	return &StationNameIDMapper{
		NameToID: make(map[string]int),
		IDToName: make([]string, 0),
	}
}

// GetOrAddID は指定された駅名の数値IDを返します。
// 駅名が登録されていない場合は新しくIDを割り当てて登録します。
func (m *StationNameIDMapper) GetOrAddID(name string) int {
	if id, exists := m.NameToID[name]; exists {
		return id
	}
	newID := len(m.IDToName)
	m.NameToID[name] = newID
	m.IDToName = append(m.IDToName, name)
	return newID
}

// GetID は指定された駅名の数値IDを返します。
// 駅名が登録されていない場合は ok = false を返します（新しく追加はしません）。
func (m *StationNameIDMapper) GetID(name string) (id int, ok bool) {
	id, ok = m.NameToID[name]
	return
}

// GetName は指定された数値IDに対応する駅名(文字列)を返します。
func (m *StationNameIDMapper) GetName(id int) string {
	if id < 0 || id >= len(m.IDToName) {
		return ""
	}
	return m.IDToName[id]
}

// NumStations は登録されている駅の総数を返します。
func (m *StationNameIDMapper) NumStations() int {
	return len(m.IDToName)
}

// GetStation は指定されたIDの domain.Station オブジェクトを返します。
func (m *StationNameIDMapper) GetStation(id int) domain.Station {
	return domain.Station{
		ID:   id,
		Name: m.GetName(id),
	}
}
