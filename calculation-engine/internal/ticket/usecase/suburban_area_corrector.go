package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"fmt"
)

// SuburbanAreaCorrector は大都市近郊区間内完結の場合に、最短経路へ補正する機能を提供します。
type SuburbanAreaCorrector struct {
	fareEval func(path []int) (int, error)
}

func NewSuburbanAreaCorrector(fareEval func(path []int) (int, error)) *SuburbanAreaCorrector {
	return &SuburbanAreaCorrector{fareEval: fareEval}
}

func (s *SuburbanAreaCorrector) Correct(path []int, g graph.Graph) ([]int, error) {
	fmt.Printf("[SuburbanAreaCorrector] Input path length: %d\n", len(path))
	if len(path) < 2 {
		return path, nil
	}

	var jrArea domain.SuburbanAreaID = 0
	isValidSuburban := true
	hasPrivate := false

	// パス全体のエッジを走査して近郊区間条件を満たすか確認する
	for i := 0; i < len(path)-1; i++ {
		fromID := path[i]
		toID := path[i+1]

		edges := g.GetEdges(fromID)
		var edge *domain.Edge
		for _, e := range edges {
			if e.ToID == toID {
				if edge == nil || (edge.SuburbanArea == domain.SuburbanAreaNone && e.SuburbanArea != domain.SuburbanAreaNone) {
					// 近郊区間に属するエッジを優先して選択する（新幹線と在来線が並行している場合など）
					edgeCopy := e.Edge
					edge = &edgeCopy
				}
			}
		}

		if edge == nil {
			fmt.Printf("[SuburbanAreaCorrector] No edge found between %d and %d\n", fromID, toID)
			continue
		}

		if edge.Company == domain.Other {
			hasPrivate = true
			fmt.Printf("[SuburbanAreaCorrector] Found private company edge between %d and %d\n", fromID, toID)
		} else {
			if edge.SuburbanArea == domain.SuburbanAreaNone {
				isValidSuburban = false
				fmt.Printf("[SuburbanAreaCorrector] Edge between %d and %d is NOT in suburban area (SuburbanAreaNone)\n", fromID, toID)
				break
			}
			if jrArea == 0 {
				jrArea = edge.SuburbanArea
			} else if jrArea != edge.SuburbanArea {
				isValidSuburban = false
				fmt.Printf("[SuburbanAreaCorrector] Edge between %d and %d changes suburban area from %d to %d\n", fromID, toID, jrArea, edge.SuburbanArea)
				break
			}
		}
	}

	fmt.Printf("[SuburbanAreaCorrector] Result: isValidSuburban=%v, jrArea=%v, hasPrivate=%v\n", isValidSuburban, jrArea, hasPrivate)

	if !isValidSuburban || jrArea == 0 || hasPrivate {
		return path, nil
	}

	startID := path[0]
	endID := path[len(path)-1]

	// 候補となる経路を保持
	var candidatePaths [][]int

	// 1. 最短擬制キロ経路
	resGisei, err := s.findShortestPathGisei(startID, endID, jrArea, g)
	if err == nil {
		candidatePaths = append(candidatePaths, resGisei.StationIDs)
	}

	// 2. 最短営業キロ経路
	resEigyo, err := s.findShortestPathEigyo(startID, endID, jrArea, g)
	if err == nil {
		candidatePaths = append(candidatePaths, resEigyo.StationIDs)
	}

	// 3. 電車特定区間内の最短営業キロ経路
	resTrainSpecific, err := s.findShortestPathEigyoTrainSpecific(startID, endID, g)
	if err == nil {
		candidatePaths = append(candidatePaths, resTrainSpecific.StationIDs)
	}

	if len(candidatePaths) == 0 {
		return path, nil
	}

	// s.fareEval が設定されていない場合は、フォールバックとして擬制キロ経路を返す（テスト用など）
	if s.fareEval == nil {
		return candidatePaths[0], nil
	}

	var bestPath []int
	minFare := -1

	for _, cp := range candidatePaths {
		fare, err := s.fareEval(cp)
		if err != nil {
			continue
		}
		if minFare == -1 || fare < minFare {
			minFare = fare
			bestPath = cp
		}
	}

	if bestPath == nil {
		return candidatePaths[0], nil
	}

	return bestPath, nil
}

func (s *SuburbanAreaCorrector) findShortestPathGisei(startID, endID int, jrArea domain.SuburbanAreaID, g graph.Graph) (*graph.PathResult, error) {
	if rg, ok := g.(*graph.RailwayGraph); ok {
		return rg.FindShortestPathGiseiSuburban(startID, endID, jrArea)
	}
	return nil, fmt.Errorf("graph does not support FindShortestPathGiseiSuburban")
}

func (s *SuburbanAreaCorrector) findShortestPathEigyo(startID, endID int, jrArea domain.SuburbanAreaID, g graph.Graph) (*graph.PathResult, error) {
	if rg, ok := g.(*graph.RailwayGraph); ok {
		return rg.FindShortestPathEigyoSuburban(startID, endID, jrArea)
	}
	return nil, fmt.Errorf("graph does not support FindShortestPathEigyoSuburban")
}

func (s *SuburbanAreaCorrector) findShortestPathEigyoTrainSpecific(startID, endID int, g graph.Graph) (*graph.PathResult, error) {
	if rg, ok := g.(*graph.RailwayGraph); ok {
		return rg.FindShortestPathEigyoTrainSpecific(startID, endID)
	}
	return nil, fmt.Errorf("graph does not support FindShortestPathEigyoTrainSpecific")
}

// IsSuburbanAreaComplete は与えられた経路が、JRの同一の近郊区間内で完結しているかを判定します。
// 私鉄（連絡会社線）が含まれていても、JR部分が全て同一の近郊区間内であればtrueを返します。
// 旅客営業規則第75条の判定（有効期間1日）に使用されます。
func IsSuburbanAreaComplete(path []int, g graph.Graph) bool {
	fmt.Printf("[IsSuburbanAreaComplete] Input path length: %d\n", len(path))
	if len(path) < 2 {
		return false
	}

	var jrArea domain.SuburbanAreaID = 0
	isValidSuburban := true

	for i := 0; i < len(path)-1; i++ {
		fromID := path[i]
		toID := path[i+1]

		edges := g.GetEdges(fromID)
		var edge *domain.Edge
		for _, e := range edges {
			if e.ToID == toID {
				if edge == nil || (edge.SuburbanArea == domain.SuburbanAreaNone && e.SuburbanArea != domain.SuburbanAreaNone) {
					// 近郊区間に属するエッジを優先して選択する（新幹線と在来線が並行している場合など）
					edgeCopy := e.Edge
					edge = &edgeCopy
				}
			}
		}

		if edge == nil {
			fmt.Printf("[IsSuburbanAreaComplete] No edge found between %d and %d\n", fromID, toID)
			continue
		}

		if edge.Company != domain.Other {
			if edge.SuburbanArea == domain.SuburbanAreaNone {
				isValidSuburban = false
				fmt.Printf("[IsSuburbanAreaComplete] Edge between %d and %d is NOT in suburban area (SuburbanAreaNone)\n", fromID, toID)
				break
			}
			if jrArea == 0 {
				jrArea = edge.SuburbanArea
			} else if jrArea != edge.SuburbanArea {
				isValidSuburban = false
				fmt.Printf("[IsSuburbanAreaComplete] Edge between %d and %d changes suburban area from %d to %d\n", fromID, toID, jrArea, edge.SuburbanArea)
				break
			}
		}
	}

	fmt.Printf("[IsSuburbanAreaComplete] Result: isValidSuburban=%v, jrArea=%d\n", isValidSuburban, jrArea)
	return isValidSuburban && jrArea != 0
}
