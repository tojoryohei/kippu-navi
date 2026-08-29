package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"reflect"
	"testing"
)

type mockSuburbanGraph struct {
	graph.Graph
	edges         map[int][]ticketdomain.TicketEdge
	shortestPaths map[string]*graph.PathResult
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
	return nil, nil
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

	c := NewSuburbanAreaCorrector()

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
