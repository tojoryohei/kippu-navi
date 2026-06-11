package graph

import (
	"fmt"
	"split-pass-api/internal/domain"
)

// NewIcPassGraph はベースとなるグラフから IC定期券対応区間のみを抽出した新しいグラフを生成します。
func NewIcPassGraph(base *RailwayGraph) (*RailwayGraph, error) {
	if base == nil {
		return nil, fmt.Errorf("ベースグラフがnilです。")
	}

	numStations := base.NumStations()

	if len(base.Edges) != numStations {
		return nil, fmt.Errorf("ベースグラフの不整合: 駅数(%d)とエッジスライスのサイズ(%d)が一致しません", numStations, len(base.Edges))
	}

	newFastGraph := &FastGraph{
		Edges: make([][]domain.Edge, numStations),
	}

	// 整合性が保証されているため、インデックス管理を排除し range で安全かつ最速に走査する
	for fromID, baseEdges := range base.Edges {
		if len(baseEdges) == 0 {
			continue
		}

		filteredEdges := make([]domain.Edge, 0, len(baseEdges))
		for _, edge := range baseEdges {
			if edge.IsIcPassArea {
				filteredEdges = append(filteredEdges, edge)
			}
		}

		if len(filteredEdges) > 0 {
			newFastGraph.Edges[fromID] = filteredEdges
		}
	}

	return &RailwayGraph{
		FastGraph:           newFastGraph,
		StationNameIDMapper: base.StationNameIDMapper,
	}, nil
}
