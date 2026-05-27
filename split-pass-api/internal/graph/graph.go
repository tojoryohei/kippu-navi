package graph

import (
	"encoding/gob"
	"os"
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

// Graph は駅データとネットワーク構造を統合して管理します。
type Graph struct {
	*FastGraph
	*StationNameIDMapper
}

// NewGraph は空のグラフインスタンスを作成します。
func NewGraph(numStations int) *Graph {
	return &Graph{
		FastGraph:           NewFastGraph(numStations),
		StationNameIDMapper: NewStationNameIDMapper(),
	}
}

// SaveBinary はグラフ全体をバイナリ形式で保存します。
func (g *Graph) SaveBinary(path string) error {
	file, err := os.Create(path)
	if err != nil {
		return err
	}
	defer file.Close()

	encoder := gob.NewEncoder(file)
	return encoder.Encode(g)
}

// LoadGraphBinary はバイナリ形式からグラフを読み込みます。
func LoadGraphBinary(path string) (*Graph, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var g Graph
	decoder := gob.NewDecoder(file)
	if err := decoder.Decode(&g); err != nil {
		return nil, err
	}
	return &g, nil
}

// NewFastGraph は指定された駅数の容量を持つ新しい FastGraph インスタンスを作成します。
func NewFastGraph(numStations int) *FastGraph {
	return &FastGraph{
		Edges: make([][]domain.Edge, numStations),
	}
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
func (m *StationNameIDMapper) GetOrAddID(name string) int {
	if id, exists := m.NameToID[name]; exists {
		return id
	}
	newID := len(m.IDToName)
	m.NameToID[name] = newID
	m.IDToName = append(m.IDToName, name)
	return newID
}

// GetName は指定された数値IDに対応する駅名(文字列)を返します。
func (m *StationNameIDMapper) GetName(id int) string {
	if id < 0 || id >= len(m.IDToName) {
		return ""
	}
	return m.IDToName[id]
}

// GetStation は指定されたIDの domain.Station オブジェクトを返します。
func (m *StationNameIDMapper) GetStation(id int) domain.Station {
	return domain.Station{
		ID:   id,
		Name: m.GetName(id),
	}
}
