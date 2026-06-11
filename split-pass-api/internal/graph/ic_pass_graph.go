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

	// BFSにより連結成分を特定し、GroupIDsを割り当てる
	groupIDs := make([]int, numStations)
	currentGroupID := 1

	// 最大でも全駅数を超えないBFS用キューを1回だけ事前確保する
	queue := make([]int, 0, numStations)

	for i := 0; i < numStations; i++ {
		// すでにグループが割り当てられているか、エッジを持たない場合はスキップ
		if groupIDs[i] != 0 || len(newFastGraph.Edges[i]) == 0 {
			continue
		}

		// キューの中身をリセットして始点を追加
		queue = append(queue[:0], i)
		groupIDs[i] = currentGroupID

		// head インデックスを使ってキューを読み進める
		head := 0
		for head < len(queue) {
			curr := queue[head]
			head++

			for _, edge := range newFastGraph.Edges[curr] {
				if groupIDs[edge.ToID] == 0 {
					groupIDs[edge.ToID] = currentGroupID
					queue = append(queue, edge.ToID)
				}
			}
		}
		currentGroupID++
	}

	return &RailwayGraph{
		FastGraph:           newFastGraph,
		StationNameIDMapper: base.StationNameIDMapper,
		GroupIDs:            groupIDs,
	}, nil
}
