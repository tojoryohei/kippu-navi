package usecase

import (
	"fmt"
	"reflect"
	"testing"

	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
)

func TestSpecialFareRuleResolverUncorrectKeepsInputPath(t *testing.T) {
	g := graph.NewGraph(4)
	startID := g.GetOrAddID("大阪市内")
	middleID := g.GetOrAddID("新大阪")
	endID := g.GetOrAddID("新神戸")
	input := []int{startID, middleID, endID}

	resolver := &SpecialFareRuleResolver{
		osakaCityCorrector: preOsakaCorrector{},
		graph:              g,
		zoneRegistry:       &graphio.SpecialZoneRegistry{},
	}
	got, err := resolver.Resolve(input, "uncorrect")
	if err != nil {
		t.Fatalf("補正禁止モードの解決に失敗しました: %v", err)
	}
	if len(got) != 1 || !reflect.DeepEqual(got[0].Path, input) {
		t.Fatalf("補正禁止モードで経路が変更されました: %+v", got)
	}
}

func TestSpecialFareRuleResolverUncorrectAppliesArticle88(t *testing.T) {
	g := &mockGraphCorrector{
		names: map[int]string{
			1: "大阪",
			2: "姫路",
			3: "大阪・新大阪",
		},
	}
	resolver := &SpecialFareRuleResolver{
		zoneRegistry: &graphio.SpecialZoneRegistry{},
		graph:        g,
	}

	candidates, err := resolver.Resolve([]int{1, 2}, "uncorrect")
	if err != nil {
		t.Fatalf("補正禁止モードの解決に失敗しました: %v", err)
	}
	if len(candidates) != 2 {
		t.Fatalf("第88条候補と入力経路の2候補を期待しました: %+v", candidates)
	}
	if want := []int{3, 1, 2}; !reflect.DeepEqual(candidates[0].Path, want) {
		t.Fatalf("補正禁止モードで第88条が適用されていません: got %v, want %v", candidates[0].Path, want)
	}
	if want := []int{1, 2}; !reflect.DeepEqual(candidates[1].Path, want) {
		t.Fatalf("第88条候補の後に入力経路へ戻りません: got %v, want %v", candidates[1].Path, want)
	}
}

func TestSpecialFareRuleResolverUncorrectAppliesTokyoZones(t *testing.T) {
	tests := []struct {
		name     string
		zoneName string
	}{
		{name: "東京都区内", zoneName: "東京都区内"},
		{name: "東京山手線内", zoneName: "東京山手線内"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := &mockGraphCorrector{
				names: map[int]string{
					1: "新宿",
					2: "品川",
					3: "小田原",
					4: tt.zoneName,
				},
			}
			zone := ticketdomain.SpecialZone{
				Name:                tt.zoneName,
				Stations:            []string{"新宿", "品川"},
				MinDistanceDeciKilo: 2000,
			}
			registry := &graphio.SpecialZoneRegistry{
				StationToZones: map[string][]ticketdomain.SpecialZone{
					"新宿": {zone},
				},
			}
			resolver := &SpecialFareRuleResolver{
				applier:      NewSpecialZoneApplier(g, registry),
				zoneRegistry: registry,
				graph:        g,
			}

			candidates, err := resolver.Resolve([]int{1, 2, 3}, "uncorrect")
			if err != nil {
				t.Fatalf("補正禁止モードの解決に失敗しました: %v", err)
			}
			if len(candidates) != 2 {
				t.Fatalf("特例候補と入力経路の2候補を期待しました: %+v", candidates)
			}
			if want := []int{4, 2, 3}; !reflect.DeepEqual(candidates[0].Path, want) {
				t.Fatalf("補正禁止モードで%sが適用されていません: got %v, want %v", tt.zoneName, candidates[0].Path, want)
			}
		})
	}
}

type preOsakaCorrector struct{}

func (preOsakaCorrector) Correct(_ []int, _ graph.Graph) ([]int, error) {
	// 大阪市内の事後補正を表すテスト用の変換。第88条がこの変換後の
	// 経路に対して評価されることを確認する。
	return []int{3, 4}, nil
}

func TestSpecialFareRuleResolverAppliesOsakaCityCorrectionBeforeArticle88(t *testing.T) {
	g := &mockGraphCorrector{
		names: map[int]string{
			1: "入力発駅",
			2: "入力着駅",
			3: "大阪",
			4: "姫路",
			5: "大阪・新大阪",
		},
	}
	resolver := &SpecialFareRuleResolver{
		osakaCityCorrector: preOsakaCorrector{},
		zoneRegistry:       &graphio.SpecialZoneRegistry{},
		graph:              g,
	}

	candidates, err := resolver.Resolve([]int{1, 2}, "normal")
	if err != nil {
		t.Fatalf("通常モードの解決に失敗しました: %v", err)
	}
	if len(candidates) < 2 {
		t.Fatalf("第88条候補が生成されませんでした: %+v", candidates)
	}

	wantArticle88Path := []int{5, 3, 4}
	if !reflect.DeepEqual(candidates[0].Path, wantArticle88Path) {
		t.Fatalf("事後補正後に第88条が適用されていません: got %v, want %v", candidates[0].Path, wantArticle88Path)
	}
}

type suburbanResolverGraph struct {
	graph.Graph
	names       map[int]string
	ids         map[string]int
	edges       map[int][]ticketdomain.TicketEdge
	shortest    map[[2]int]*graph.PathResult
	lookupCount int
}

func (g *suburbanResolverGraph) GetName(id int) string { return g.names[id] }
func (g *suburbanResolverGraph) GetID(name string) (int, bool) {
	id, ok := g.ids[name]
	return id, ok
}
func (g *suburbanResolverGraph) GetEdges(id int) []ticketdomain.TicketEdge { return g.edges[id] }
func (g *suburbanResolverGraph) FindShortestPathGiseiSuburban(startID, endID int, _ domain.SuburbanAreaID) (*graph.PathResult, error) {
	g.lookupCount++
	if result, ok := g.shortest[[2]int{startID, endID}]; ok {
		return result, nil
	}
	return nil, fmt.Errorf("path not found")
}

type noopPathCorrector struct{}

func (noopPathCorrector) Correct(path []int, _ graph.Graph) ([]int, error) { return path, nil }

func TestSpecialFareRuleResolverUsesOneSideZoneForPureJRSuburbanPath(t *testing.T) {
	g := &suburbanResolverGraph{
		names: map[int]string{1: "立川", 2: "新宿", 3: "東京", 4: "東京山手線内"},
		ids:   map[string]int{"立川": 1, "新宿": 2, "東京": 3, "東京山手線内": 4},
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{FromID: 1, ToID: 2, Company: domain.JREast, SuburbanArea: domain.SuburbanAreaTokyo}}, {Edge: domain.Edge{FromID: 1, ToID: 3, Company: domain.JREast, SuburbanArea: domain.SuburbanAreaTokyo}}},
		},
		shortest: map[[2]int]*graph.PathResult{
			{1, 3}: {StationIDs: []int{1, 3}, EigyoKilo: 1500},
		},
	}
	zone := ticketdomain.SpecialZone{
		Name:                "東京山手線内",
		MinDistanceDeciKilo: 1000,
		MaxDistanceDeciKilo: 2000,
		Stations:            []string{"東京", "新宿"},
	}
	registry := &graphio.SpecialZoneRegistry{
		Zones:          []ticketdomain.SpecialZone{zone},
		StationToZones: map[string][]ticketdomain.SpecialZone{"新宿": {zone}},
	}
	resolver := &SpecialFareRuleResolver{
		applier:            NewSpecialZoneApplier(g, registry),
		osakaCityCorrector: noopPathCorrector{},
		zoneRegistry:       registry,
		graph:              g,
	}

	candidates, err := resolver.Resolve([]int{1, 2}, "normal")
	if err != nil {
		t.Fatalf("通常モードの解決に失敗しました: %v", err)
	}
	if len(candidates) == 0 || !reflect.DeepEqual(candidates[0].Path, []int{1, 3, 4}) {
		t.Fatalf("片側ゾーン候補が先頭にありません: %+v", candidates)
	}
	if candidates[0].CheckThreshold {
		t.Fatal("中心駅までの距離を事前判定した候補で閾値再判定が有効です")
	}
}

func TestNormalizeFareEvaluationMode(t *testing.T) {
	tests := map[string]string{
		"normal":    "normal",
		"cheapest":  "normal",
		"uncorrect": "uncorrect",
		"unknown":   "normal",
	}
	for input, want := range tests {
		if got := NormalizeFareEvaluationMode(input); got != want {
			t.Fatalf("運賃評価モードの正規化が不正です: input=%q got=%q want=%q", input, got, want)
		}
	}
}

func TestSpecialFareRuleResolverSkipsOneSideZoneForMixedPath(t *testing.T) {
	g := &suburbanResolverGraph{
		names: map[int]string{1: "立川", 2: "私鉄接続", 3: "私鉄終点", 4: "新宿"},
		ids:   map[string]int{"立川": 1, "私鉄接続": 2, "私鉄終点": 3, "新宿": 4, "東京山手線内": 5},
		edges: map[int][]ticketdomain.TicketEdge{
			1: {{Edge: domain.Edge{FromID: 1, ToID: 2, Company: domain.JREast, SuburbanArea: domain.SuburbanAreaTokyo}}},
			2: {{Edge: domain.Edge{FromID: 2, ToID: 3, Company: domain.Other}}},
			3: {{Edge: domain.Edge{FromID: 3, ToID: 4, Company: domain.JREast, SuburbanArea: domain.SuburbanAreaTokyo}}},
		},
	}
	zone := ticketdomain.SpecialZone{Name: "東京山手線内", Stations: []string{"新宿", "東京"}, MinDistanceDeciKilo: 1000, MaxDistanceDeciKilo: 2000}
	registry := &graphio.SpecialZoneRegistry{Zones: []ticketdomain.SpecialZone{zone}, StationToZones: map[string][]ticketdomain.SpecialZone{"新宿": {zone}}}
	resolver := &SpecialFareRuleResolver{applier: NewSpecialZoneApplier(g, registry), osakaCityCorrector: noopPathCorrector{}, zoneRegistry: registry, graph: g}
	if _, err := resolver.Resolve([]int{1, 2, 3, 4}, "normal"); err != nil {
		t.Fatalf("混在経路の解決に失敗しました: %v", err)
	}
	if g.lookupCount != 0 {
		t.Fatalf("混在経路で片側ゾーン用の中心駅探索が呼ばれました: %d", g.lookupCount)
	}
}

func TestSpecialZoneApplierSuburbanYamanoteThreshold(t *testing.T) {
	for _, tc := range []struct {
		distance domain.DeciKilo
		want     bool
	}{
		{distance: 1000, want: false},
		{distance: 1001, want: true},
		{distance: 2000, want: true},
		{distance: 2001, want: false},
	} {
		t.Run(fmt.Sprintf("営業キロ%d", tc.distance), func(t *testing.T) {
			g := &suburbanResolverGraph{
				names: map[int]string{1: "立川", 2: "新宿", 3: "東京", 4: "東京山手線内"},
				ids:   map[string]int{"立川": 1, "新宿": 2, "東京": 3, "東京山手線内": 4},
				edges: map[int][]ticketdomain.TicketEdge{
					1: {{Edge: domain.Edge{FromID: 1, ToID: 2, Company: domain.JREast, SuburbanArea: domain.SuburbanAreaTokyo}}, {Edge: domain.Edge{FromID: 1, ToID: 3, Company: domain.JREast, SuburbanArea: domain.SuburbanAreaTokyo}}},
				},
				shortest: map[[2]int]*graph.PathResult{{1, 3}: {StationIDs: []int{1, 3}, EigyoKilo: tc.distance}},
			}
			zone := ticketdomain.SpecialZone{Name: "東京山手線内", MinDistanceDeciKilo: 1000, MaxDistanceDeciKilo: 2000, Stations: []string{"東京"}}
			registry := &graphio.SpecialZoneRegistry{Zones: []ticketdomain.SpecialZone{zone}}
			info, got := NewSpecialZoneApplier(g, registry).applySuburban([]int{1, 2}, domain.SuburbanAreaTokyo)
			if got != tc.want {
				t.Fatalf("適用 = %v, want %v (info=%+v)", got, tc.want, info)
			}
		})
	}
}
