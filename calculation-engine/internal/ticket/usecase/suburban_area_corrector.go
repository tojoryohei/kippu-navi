package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"fmt"
)

// SuburbanAreaCorrector は大都市近郊区間内完結の場合に、最安経路へ補正する機能を提供します。
// fareEval には、特例適用後の運賃を返す評価関数を指定します。
type SuburbanAreaCorrector struct {
	fareEval func(path []int) (int, error)
}

type suburbanJRSegment struct {
	startIndex int
	endIndex   int
}

func NewSuburbanAreaCorrector(fareEval func(path []int) (int, error)) *SuburbanAreaCorrector {
	return &SuburbanAreaCorrector{fareEval: fareEval}
}

func (s *SuburbanAreaCorrector) Correct(path []int, g graph.Graph) ([]int, error) {
	if len(path) < 2 {
		return path, nil
	}

	// 私鉄区間を境界としてJR区間を個別に候補化し、各区間で最安の候補を選んで結合する。
	jrArea, segments, ok := collectSuburbanJRSegments(path, g)
	if !ok || jrArea == domain.SuburbanAreaNone || len(segments) == 0 {
		return path, nil
	}

	segmentCandidates := make([][][]int, 0, len(segments))
	for _, segment := range segments {
		segmentCandidates = append(segmentCandidates, s.segmentCandidates(path, segment, jrArea, g))
	}

	selectedCandidates := firstCandidates(segmentCandidates)
	if s.fareEval != nil {
		for i, candidates := range segmentCandidates {
			selectedCandidates[i] = s.selectCheapestCandidate(candidates)
		}
	}
	return combineSuburbanCandidates(path, segments, selectedCandidates), nil
}

func (s *SuburbanAreaCorrector) selectCheapestCandidate(candidates [][]int) []int {
	bestCandidate := candidates[0]
	bestFare := 0
	foundFare := false
	for _, candidate := range candidates {
		fare, err := s.fareEval(candidate)
		if err != nil {
			continue
		}
		if !foundFare || fare < bestFare {
			bestCandidate = candidate
			bestFare = fare
			foundFare = true
		}
	}
	return bestCandidate
}

func collectSuburbanJRSegments(path []int, g graph.Graph) (domain.SuburbanAreaID, []suburbanJRSegment, bool) {
	var jrArea domain.SuburbanAreaID
	segments := make([]suburbanJRSegment, 0)
	currentStart := -1

	for i := 0; i < len(path)-1; i++ {
		edge := edgeForPathStep(path, i, g)
		if edge == nil {
			return domain.SuburbanAreaNone, nil, false
		}

		if edge.Company == domain.Other {
			if currentStart >= 0 {
				segments = append(segments, suburbanJRSegment{startIndex: currentStart, endIndex: i})
				currentStart = -1
			}
			continue
		}

		if edge.SuburbanArea == domain.SuburbanAreaNone {
			return domain.SuburbanAreaNone, nil, false
		}
		if jrArea == domain.SuburbanAreaNone {
			jrArea = edge.SuburbanArea
		} else if jrArea != edge.SuburbanArea {
			return domain.SuburbanAreaNone, nil, false
		}
		if currentStart < 0 {
			currentStart = i
		}
	}

	if currentStart >= 0 {
		segments = append(segments, suburbanJRSegment{startIndex: currentStart, endIndex: len(path) - 1})
	}
	return jrArea, segments, true
}

// pureJRSuburbanArea は、経路全体が同一の近郊区間に属する連続したJR区間かを判定します。
// 私鉄を含む経路は、区間ごとの候補補正と最終的な運賃計算で扱いが異なるため、
// ここでは経路全体が一つのJR区間である場合だけ成功とします。
func pureJRSuburbanArea(path []int, g graph.Graph) (domain.SuburbanAreaID, bool) {
	if g == nil {
		return domain.SuburbanAreaNone, false
	}
	if _, supportsSuburban := g.(interface {
		FindShortestPathGiseiSuburban(int, int, domain.SuburbanAreaID) (*graph.PathResult, error)
	}); !supportsSuburban {
		return domain.SuburbanAreaNone, false
	}
	area, segments, ok := collectSuburbanJRSegments(path, g)
	if !ok || area == domain.SuburbanAreaNone || len(segments) != 1 {
		return domain.SuburbanAreaNone, false
	}
	segment := segments[0]
	if segment.startIndex != 0 || segment.endIndex != len(path)-1 {
		return domain.SuburbanAreaNone, false
	}
	return area, true
}

func edgeForPathStep(path []int, index int, g graph.Graph) *domain.Edge {
	if index < 0 || index+1 >= len(path) {
		return nil
	}

	var edge *domain.Edge
	for _, e := range g.GetEdges(path[index]) {
		if e.ToID != path[index+1] {
			continue
		}
		if edge == nil || (edge.SuburbanArea == domain.SuburbanAreaNone && e.SuburbanArea != domain.SuburbanAreaNone) {
			// 近郊区間に属するエッジを優先して選択する（新幹線と在来線が並行している場合など）
			edgeCopy := e.Edge
			edge = &edgeCopy
		}
	}
	return edge
}

func (s *SuburbanAreaCorrector) segmentCandidates(path []int, segment suburbanJRSegment, jrArea domain.SuburbanAreaID, g graph.Graph) [][]int {
	startID := path[segment.startIndex]
	endID := path[segment.endIndex]
	original := append([]int(nil), path[segment.startIndex:segment.endIndex+1]...)
	candidates := make([][]int, 0, 3)
	appendCandidate := func(candidate []int) {
		if len(candidate) == 0 {
			return
		}
		for _, existing := range candidates {
			if equalStationPath(existing, candidate) {
				return
			}
		}
		candidates = append(candidates, append([]int(nil), candidate...))
	}

	// 1. 最短擬制キロ経路
	if result, err := s.findShortestPathGisei(startID, endID, jrArea, g); err == nil {
		appendCandidate(result.StationIDs)
	}
	// 2. 最短営業キロ経路
	if result, err := s.findShortestPathEigyo(startID, endID, jrArea, g); err == nil {
		appendCandidate(result.StationIDs)
	}
	// 3. 電車特定区間内の最短営業キロ経路
	if result, err := s.findShortestPathEigyoTrainSpecific(startID, endID, g); err == nil {
		appendCandidate(result.StationIDs)
	}

	if len(candidates) == 0 {
		return [][]int{original}
	}
	return candidates
}

func firstCandidates(candidates [][][]int) [][]int {
	first := make([][]int, len(candidates))
	for i := range candidates {
		first[i] = candidates[i][0]
	}
	return first
}

func combineSuburbanCandidates(path []int, segments []suburbanJRSegment, selected [][]int) []int {
	combined := make([]int, 0, len(path))
	lastEnd := -1
	for i, segment := range segments {
		if lastEnd < 0 {
			combined = appendPathWithoutDuplicate(combined, path[:segment.startIndex])
		} else {
			combined = appendPathWithoutDuplicate(combined, path[lastEnd:segment.startIndex])
		}
		combined = appendPathWithoutDuplicate(combined, selected[i])
		lastEnd = segment.endIndex
	}
	if lastEnd >= 0 {
		combined = appendPathWithoutDuplicate(combined, path[lastEnd:])
	}
	return combined
}

func appendPathWithoutDuplicate(path, addition []int) []int {
	if len(addition) == 0 {
		return path
	}
	start := 0
	if len(path) > 0 && path[len(path)-1] == addition[0] {
		start = 1
	}
	return append(path, addition[start:]...)
}

func equalStationPath(left, right []int) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}

func (s *SuburbanAreaCorrector) findShortestPathGisei(startID, endID int, jrArea domain.SuburbanAreaID, g graph.Graph) (*graph.PathResult, error) {
	if f, ok := g.(interface {
		FindShortestPathGiseiSuburban(int, int, domain.SuburbanAreaID) (*graph.PathResult, error)
	}); ok {
		return f.FindShortestPathGiseiSuburban(startID, endID, jrArea)
	}
	return nil, fmt.Errorf("graph does not support FindShortestPathGiseiSuburban")
}

func (s *SuburbanAreaCorrector) findShortestPathEigyo(startID, endID int, jrArea domain.SuburbanAreaID, g graph.Graph) (*graph.PathResult, error) {
	if f, ok := g.(interface {
		FindShortestPathEigyoSuburban(int, int, domain.SuburbanAreaID) (*graph.PathResult, error)
	}); ok {
		return f.FindShortestPathEigyoSuburban(startID, endID, jrArea)
	}
	return nil, fmt.Errorf("graph does not support FindShortestPathEigyoSuburban")
}

func (s *SuburbanAreaCorrector) findShortestPathEigyoTrainSpecific(startID, endID int, g graph.Graph) (*graph.PathResult, error) {
	if f, ok := g.(interface {
		FindShortestPathEigyoTrainSpecific(int, int) (*graph.PathResult, error)
	}); ok {
		return f.FindShortestPathEigyoTrainSpecific(startID, endID)
	}
	return nil, fmt.Errorf("graph does not support FindShortestPathEigyoTrainSpecific")
}

// IsSuburbanAreaComplete は与えられた経路が、JRの同一の近郊区間内で完結しているかを判定します。
// 私鉄（連絡会社線）が含まれていても、JR部分が全て同一の近郊区間内であればtrueを返します。
// 旅客営業規則第75条の判定（有効期間1日）に使用されます。
func IsSuburbanAreaComplete(path []int, g graph.Graph) bool {
	if len(path) < 2 {
		return false
	}

	var jrArea domain.SuburbanAreaID = 0
	isValidSuburban := true

	for i := 0; i < len(path)-1; i++ {
		edge := edgeForPathStep(path, i, g)

		if edge == nil {
			continue
		}

		if edge.Company != domain.Other {
			if edge.SuburbanArea == domain.SuburbanAreaNone {
				isValidSuburban = false
				break
			}
			if jrArea == 0 {
				jrArea = edge.SuburbanArea
			} else if jrArea != edge.SuburbanArea {
				isValidSuburban = false
				break
			}
		}
	}

	return isValidSuburban && jrArea != 0
}
