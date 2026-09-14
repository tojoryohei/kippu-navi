package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"fmt"
	"reflect"
	"testing"
)

type mockSuburbanGraph struct {
	graph.Graph
	edges         map[int][]ticketdomain.TicketEdge
	shortestPaths map[string]*graph.PathResult
	eigyoPaths    map[string]*graph.PathResult
	trainPaths    map[string]*graph.PathResult
}

func (m *mockSuburbanGraph) GetEdges(id int) []ticketdomain.TicketEdge {
	return m.edges[id]
}

func (m *mockSuburbanGraph) FindShortestPathGisei(startID, endID int) (*graph.PathResult, error) {
	key := string(rune(startID)) + "-" + string(rune(endID))
	if p, ok := m.shortestPaths[key]; ok {
		return p, nil
	}
	// Fallback for missing mocks
	return nil, fmt.Errorf("not found")
}

func (m *mockSuburbanGraph) FindShortestPathGiseiSuburban(startID, endID int, areaID domain.SuburbanAreaID) (*graph.PathResult, error) {
	key := string(rune(startID)) + "-" + string(rune(endID))
	if p, ok := m.shortestPaths[key]; ok {
		return p, nil
	}
	return nil, fmt.Errorf("not found")
}

func (m *mockSuburbanGraph) FindShortestPathEigyoSuburban(startID, endID int, areaID domain.SuburbanAreaID) (*graph.PathResult, error) {
	key := string(rune(startID)) + "-" + string(rune(endID))
	if p, ok := m.eigyoPaths[key]; ok {
		return p, nil
	}
	return nil, fmt.Errorf("not implemented")
}

func (m *mockSuburbanGraph) FindShortestPathEigyoTrainSpecific(startID, endID int) (*graph.PathResult, error) {
	key := string(rune(startID)) + "-" + string(rune(endID))
	if p, ok := m.trainPaths[key]; ok {
		return p, nil
	}
	return nil, fmt.Errorf("not implemented")
}

func TestSuburbanAreaCorrector(t *testing.T) {
	g := &mockSuburbanGraph{
		edges: map[int][]ticketdomain.TicketEdge{
			// 神田(1) -> 秋葉原(2)
			1: {{Edge: domain.Edge{ToID: 2, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JRCentral}}},
			// 秋葉原(2) -> 御茶ノ水(3)
			2: {{Edge: domain.Edge{ToID: 3, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
			// 神田(1) -> 御茶ノ水(3) (直通エッジ、最短経路)
		},
		shortestPaths: map[string]*graph.PathResult{
			"\x01-\x03": {StationIDs: []int{1, 3}}, // 1(神田) -> 3(御茶ノ水)
		},
	}

	c := NewSuburbanAreaCorrector(nil)

	tests := []struct {
		name     string
		input    []int
		expected []int
	}{
		{
			name:     "大都市近郊区間完結の場合、最短経路に補正される",
			input:    []int{1, 2, 3}, // 神田 -> 秋葉原 -> 御茶ノ水
			expected: []int{1, 3},    // 神田 -> 御茶ノ水
		},
		{
			name:     "2駅未満の場合はそのまま",
			input:    []int{1},
			expected: []int{1},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, err := c.Correct(tc.input, g)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(got, tc.expected) {
				t.Errorf("expected %v, got %v", tc.expected, got)
			}
		})
	}
}

func TestIsSuburbanAreaComplete(t *testing.T) {
	g := &mockSuburbanGraph{
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{ToID: 2, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JRCentral}}},
			2: {{Edge: domain.Edge{ToID: 3, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
			3: {{Edge: domain.Edge{ToID: 4, SuburbanArea: domain.SuburbanAreaOsaka, Company: domain.JREast}}}, // 違うエリア
			4: {{Edge: domain.Edge{ToID: 5, SuburbanArea: domain.SuburbanAreaNone, Company: domain.JREast}}},  // 対象外
		},
	}

	tests := []struct {
		name     string
		input    []int
		expected bool
	}{
		{
			name:     "同一の近郊区間で完結する場合はtrue",
			input:    []int{1, 2, 3},
			expected: true,
		},
		{
			name:     "異なる近郊区間にまたがる場合はfalse",
			input:    []int{2, 3, 4},
			expected: false,
		},
		{
			name:     "近郊区間対象外が含まれる場合はfalse",
			input:    []int{3, 4, 5},
			expected: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := IsSuburbanAreaComplete(tc.input, g)
			if got != tc.expected {
				t.Errorf("expected %v, got %v", tc.expected, got)
			}
		})
	}
}

func TestSuburbanAreaCorrectorKeepsPrivateSectionAndChoosesCheapestPerJRSegment(t *testing.T) {
	g := &mockSuburbanGraph{
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{ToID: 2, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JRCentral}}},
			2: {{Edge: domain.Edge{ToID: 3, Company: domain.Other}}},
			3: {{Edge: domain.Edge{ToID: 4, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
			4: {{Edge: domain.Edge{ToID: 5, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
		},
		shortestPaths: map[string]*graph.PathResult{
			"\x01-\x02": {StationIDs: []int{1, 6, 2}},
			"\x03-\x05": {StationIDs: []int{3, 7, 5}},
		},
		eigyoPaths: map[string]*graph.PathResult{
			"\x01-\x02": {StationIDs: []int{1, 8, 2}},
			"\x03-\x05": {StationIDs: []int{3, 9, 5}},
		},
	}

	fares := map[string]int{
		"1,6,2": 300,
		"1,8,2": 200,
		"3,7,5": 250,
		"3,9,5": 220,
	}
	var evaluated [][]int
	c := NewSuburbanAreaCorrector(func(path []int) (int, error) {
		evaluated = append(evaluated, append([]int(nil), path...))
		fare, ok := fares[pathKey(path)]
		if !ok {
			return 0, fmt.Errorf("unexpected path: %v", path)
		}
		return fare, nil
	})

	got, err := c.Correct([]int{1, 2, 3, 4, 5}, g)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := []int{1, 8, 2, 3, 9, 5}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("expected cheapest physical path %v, got %v", want, got)
	}
	if len(evaluated) != 4 {
		t.Fatalf("expected 4 per-segment candidate evaluations, got %d: %v", len(evaluated), evaluated)
	}
	if !reflect.DeepEqual(got[2:4], []int{2, 3}) {
		t.Fatalf("private section was not preserved: %v", got)
	}
}

func TestSuburbanAreaCorrectorEvaluatesEachJRSegmentIndependently(t *testing.T) {
	g := &mockSuburbanGraph{
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{ToID: 2, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JRCentral}}},
			2: {{Edge: domain.Edge{ToID: 3, Company: domain.Other}}},
			3: {{Edge: domain.Edge{ToID: 4, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
			4: {{Edge: domain.Edge{ToID: 5, Company: domain.Other}}},
			5: {{Edge: domain.Edge{ToID: 6, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
			6: {{Edge: domain.Edge{ToID: 7, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
		},
		shortestPaths: map[string]*graph.PathResult{
			"\x01-\x02": {StationIDs: []int{1, 8, 2}},
			"\x03-\x04": {StationIDs: []int{3, 9, 4}},
			"\x05-\x07": {StationIDs: []int{5, 10, 7}},
		},
		eigyoPaths: map[string]*graph.PathResult{
			"\x01-\x02": {StationIDs: []int{1, 11, 2}},
			"\x03-\x04": {StationIDs: []int{3, 12, 4}},
			"\x05-\x07": {StationIDs: []int{5, 13, 7}},
		},
		trainPaths: map[string]*graph.PathResult{
			"\x01-\x02": {StationIDs: []int{1, 14, 2}},
			"\x03-\x04": {StationIDs: []int{3, 15, 4}},
			"\x05-\x07": {StationIDs: []int{5, 16, 7}},
		},
	}

	evaluated := 0
	c := NewSuburbanAreaCorrector(func(path []int) (int, error) {
		evaluated++
		return 100, nil
	})

	got, err := c.Correct([]int{1, 2, 3, 4, 5, 6, 7}, g)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if evaluated != 9 {
		t.Fatalf("expected 9 per-segment candidate evaluations, got %d", evaluated)
	}
	if want := []int{1, 8, 2, 3, 9, 4, 5, 10, 7}; !reflect.DeepEqual(got, want) {
		t.Fatalf("tie should keep first combination: got %v, want %v", got, want)
	}
}

func TestSuburbanAreaCorrectorDoesNotCorrectMixedJRAreasWithPrivateSection(t *testing.T) {
	called := false
	g := &mockSuburbanGraph{
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{ToID: 2, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JRCentral}}},
			2: {{Edge: domain.Edge{ToID: 3, Company: domain.Other}}},
			3: {{Edge: domain.Edge{ToID: 4, SuburbanArea: domain.SuburbanAreaOsaka, Company: domain.JRWest}}},
		},
	}
	c := NewSuburbanAreaCorrector(func(path []int) (int, error) {
		called = true
		return 0, nil
	})

	input := []int{1, 2, 3, 4}
	got, err := c.Correct(input, g)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(got, input) {
		t.Fatalf("mixed suburban areas should keep input path: got %v, want %v", got, input)
	}
	if called {
		t.Fatal("fare evaluator should not be called for mixed suburban areas")
	}
}

func TestSuburbanAreaCorrectorKeepsOriginalSegmentWhenNoCandidateExists(t *testing.T) {
	g := &mockSuburbanGraph{
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{ToID: 2, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JRCentral}}},
			2: {{Edge: domain.Edge{ToID: 3, Company: domain.Other}}},
			3: {{Edge: domain.Edge{ToID: 4, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
		},
		shortestPaths: map[string]*graph.PathResult{
			"\x01-\x02": {StationIDs: []int{1, 5, 2}},
		},
	}

	c := NewSuburbanAreaCorrector(func(path []int) (int, error) {
		return 100, nil
	})
	got, err := c.Correct([]int{1, 2, 3, 4}, g)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if want := []int{1, 5, 2, 3, 4}; !reflect.DeepEqual(got, want) {
		t.Fatalf("expected only the first JR segment to be corrected: got %v, want %v", got, want)
	}
}

func TestSuburbanAreaCorrectorKeepsAllPrivatePath(t *testing.T) {
	called := false
	g := &mockSuburbanGraph{
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{ToID: 2, Company: domain.Other}}},
			2: {{Edge: domain.Edge{ToID: 3, Company: domain.Other}}},
		},
	}
	c := NewSuburbanAreaCorrector(func(path []int) (int, error) {
		called = true
		return 0, nil
	})

	input := []int{1, 2, 3}
	got, err := c.Correct(input, g)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !reflect.DeepEqual(got, input) {
		t.Fatalf("all-private path should remain unchanged: got %v, want %v", got, input)
	}
	if called {
		t.Fatal("fare evaluator should not be called for an all-private path")
	}
}

func pathKey(path []int) string {
	key := ""
	for i, id := range path {
		if i > 0 {
			key += ","
		}
		key += fmt.Sprint(id)
	}
	return key
}
