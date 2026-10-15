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
	return nil, fmt.Errorf("見つかりません")
}

func (m *mockSuburbanGraph) FindShortestPathGiseiSuburban(startID, endID int, areaID domain.SuburbanAreaID) (*graph.PathResult, error) {
	key := string(rune(startID)) + "-" + string(rune(endID))
	if p, ok := m.shortestPaths[key]; ok {
		return p, nil
	}
	return nil, fmt.Errorf("見つかりません")
}

func (m *mockSuburbanGraph) FindShortestPathEigyoSuburban(startID, endID int, areaID domain.SuburbanAreaID) (*graph.PathResult, error) {
	key := string(rune(startID)) + "-" + string(rune(endID))
	if p, ok := m.eigyoPaths[key]; ok {
		return p, nil
	}
	return nil, fmt.Errorf("未実装です")
}

func (m *mockSuburbanGraph) FindShortestPathEigyoTrainSpecific(startID, endID int) (*graph.PathResult, error) {
	key := string(rune(startID)) + "-" + string(rune(endID))
	if p, ok := m.trainPaths[key]; ok {
		return p, nil
	}
	return nil, fmt.Errorf("未実装です")
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
				t.Fatalf("予期しないエラーが発生しました: %v", err)
			}
			if !reflect.DeepEqual(got, tc.expected) {
				t.Errorf("期待値 %v, 実際 %v", tc.expected, got)
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
				t.Errorf("期待値 %v, 実際 %v", tc.expected, got)
			}
		})
	}
}

func TestCalculateTicketValidDaysUsesPreShinkansenPath(t *testing.T) {
	g := &mockSuburbanGraph{
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{ToID: 2, SuburbanArea: domain.SuburbanAreaTokyo, Company: domain.JREast}}},
			2: {{Edge: domain.Edge{ToID: 3, SuburbanArea: domain.SuburbanAreaNone, Company: domain.JREast}}},
		},
	}

	got := CalculateTicketValidDays(2500, []int{1, 2}, g)
	if got != 1 {
		t.Fatalf("展開前の近郊区間経路は1日であるべきです: 実際=%d", got)
	}

	got = CalculateTicketValidDays(2500, []int{1, 2, 3}, g)
	if got != 3 {
		t.Fatalf("近郊区間外経路は距離計算へ戻るべきです: 実際=%d", got)
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
			return 0, fmt.Errorf("予期しない経路です: %v", path)
		}
		return fare, nil
	})

	got, err := c.Correct([]int{1, 2, 3, 4, 5}, g)
	if err != nil {
		t.Fatalf("予期しないエラーが発生しました: %v", err)
	}

	want := []int{1, 8, 2, 3, 9, 5}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("最安の実経路の期待値は%vですが、実際は%vでした", want, got)
	}
	if len(evaluated) != 4 {
		t.Fatalf("区間別候補の評価回数は4回を期待しましたが、実際は%d回でした: %v", len(evaluated), evaluated)
	}
	if !reflect.DeepEqual(got[2:4], []int{2, 3}) {
		t.Fatalf("会社線区間が維持されていません: %v", got)
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
		t.Fatalf("予期しないエラーが発生しました: %v", err)
	}
	if evaluated != 9 {
		t.Fatalf("区間別候補の評価回数は9回を期待しましたが、実際は%d回でした", evaluated)
	}
	if want := []int{1, 8, 2, 3, 9, 4, 5, 10, 7}; !reflect.DeepEqual(got, want) {
		t.Fatalf("同額の場合は最初の組合せを維持する必要があります: 実際%v、期待値%v", got, want)
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
		t.Fatalf("予期しないエラーが発生しました: %v", err)
	}
	if !reflect.DeepEqual(got, input) {
		t.Fatalf("異なる近郊区間をまたぐ場合は入力経路を維持する必要があります: 実際%v、期待値%v", got, input)
	}
	if called {
		t.Fatal("異なる近郊区間をまたぐ経路では運賃評価を呼び出してはいけません")
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
		t.Fatalf("予期しないエラーが発生しました: %v", err)
	}
	if want := []int{1, 5, 2, 3, 4}; !reflect.DeepEqual(got, want) {
		t.Fatalf("最初のJR区間だけが補正される必要があります: 実際%v、期待値%v", got, want)
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
		t.Fatalf("予期しないエラーが発生しました: %v", err)
	}
	if !reflect.DeepEqual(got, input) {
		t.Fatalf("全区間が会社線の経路は変更されない必要があります: 実際%v、期待値%v", got, input)
	}
	if called {
		t.Fatal("全区間が会社線の経路では運賃評価を呼び出してはいけません")
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
