package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
	"fmt"
	"io"
	"reflect"
	"testing"
)

func TestRouteExtensionMatcherMatchesOnlyTheCompleteInputPath(t *testing.T) {
	g := graph.NewGraph(4)
	addExtensionTestEdge(g, "A", "B")
	addExtensionTestEdge(g, "B", "C")

	matcher, err := NewRouteExtensionMatcher([]ticketdomain.RouteExtension{{
		InputPath:  []string{"A", "B"},
		OutputPath: []string{"A", "B", "C"},
	}}, g)
	if err != nil {
		t.Fatalf("対応表の初期化に失敗しました: %v", err)
	}

	got, ok := matcher.Match([]int{g.GetOrAddID("A"), g.GetOrAddID("B")})
	if !ok || !reflect.DeepEqual(got, []int{g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C")}) {
		t.Fatalf("延長経路が一致しません: got=%v ok=%v", got, ok)
	}
	if _, ok := matcher.Match([]int{g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C")}); ok {
		t.Fatal("入力経路の接頭辞を延長経路として一致扱いしました")
	}
}

func TestRouteExtensionMatcherMatchesReverseDirection(t *testing.T) {
	g := graph.NewGraph(4)
	addExtensionTestEdge(g, "A", "B")
	addExtensionTestEdge(g, "B", "C")

	matcher, err := NewRouteExtensionMatcher([]ticketdomain.RouteExtension{{
		InputPath:  []string{"A", "B"},
		OutputPath: []string{"A", "B", "C"},
	}}, g)
	if err != nil {
		t.Fatalf("対応表の初期化に失敗しました: %v", err)
	}

	got, ok := matcher.MatchEither([]int{g.GetOrAddID("B"), g.GetOrAddID("A")})
	want := []int{g.GetOrAddID("C"), g.GetOrAddID("B"), g.GetOrAddID("A")}
	if !ok || !reflect.DeepEqual(got, want) {
		t.Fatalf("逆方向の延長経路が一致しません: got=%v want=%v ok=%v", got, want, ok)
	}
}

func TestRouteExtensionMatcherRejectsDuplicateInputPaths(t *testing.T) {
	g := graph.NewGraph(4)
	addExtensionTestEdge(g, "A", "B")
	addExtensionTestEdge(g, "B", "C")
	addExtensionTestEdge(g, "B", "D")
	_, err := NewRouteExtensionMatcher([]ticketdomain.RouteExtension{
		{InputPath: []string{"A", "B"}, OutputPath: []string{"A", "B", "C"}},
		{InputPath: []string{"A", "B"}, OutputPath: []string{"A", "B", "D"}},
	}, g)
	if err == nil {
		t.Fatal("重複した入力経路を受け入れました")
	}
}

func TestCorrectPathForModeWithRouteExtensions(t *testing.T) {
	g := graph.NewGraph(4)
	addExtensionTestEdge(g, "A", "B")
	addExtensionTestEdge(g, "B", "C")
	matcher, err := NewRouteExtensionMatcher([]ticketdomain.RouteExtension{{
		InputPath:  []string{"A", "B"},
		OutputPath: []string{"A", "B", "C"},
	}}, g)
	if err != nil {
		t.Fatalf("対応表の初期化に失敗しました: %v", err)
	}
	corrector := extensionTestCorrector{}
	input := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}

	got, evalMode, err := CorrectPathForModeWithRouteExtensions(input, g, corrector, matcher, "cheapest")
	if err != nil {
		t.Fatalf("最安モードの補正に失敗しました: %v", err)
	}
	if !reflect.DeepEqual(got, []int{g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C")}) || evalMode != "normal" {
		t.Fatalf("対応表経路または評価モードが不正です: path=%v mode=%s", got, evalMode)
	}

	got, evalMode, err = CorrectPathForModeWithRouteExtensions(input, g, corrector, matcher, "normal")
	if err != nil || !reflect.DeepEqual(got, []int{99}) || evalMode != "normal" {
		t.Fatalf("通常モードの既存補正が変わりました: path=%v mode=%s err=%v", got, evalMode, err)
	}

	got, evalMode, err = CorrectPathForModeWithRouteExtensions(input, g, corrector, matcher, "uncorrect")
	if err != nil || !reflect.DeepEqual(got, input) || evalMode != "uncorrect" {
		t.Fatalf("補正禁止モードが変わりました: path=%v mode=%s err=%v", got, evalMode, err)
	}
}

func TestSelectCheapestPathWithRouteExtensionsSequentiallyExtendsUntilThreshold(t *testing.T) {
	g := graph.NewGraph(16)
	addFareExtensionEdge(g, "東京", "A", 1000, domain.JREast)
	addFareExtensionEdge(g, "A", "B", 600, domain.JREast)
	for i, station := range []string{"C", "D", "E", "F", "G"} {
		from := "B"
		if i > 0 {
			from = string(rune('C' + i - 1))
		}
		addFareExtensionEdge(g, from, station, 100, domain.JREast)
	}
	zones := extensionTestZones("東京", "A", 2000)
	input := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
	matcher, err := NewRouteExtensionMatcher(nil, g)
	if err != nil {
		t.Fatalf("空の対応表初期化に失敗しました: %v", err)
	}
	corrected, err := SelectCheapestPathWithRouteExtensions(input, g, extensionTestCorrector{}, matcher, zones, func(path []int) (int, error) {
		if len(path) == 7 {
			return 900, nil
		}
		return 1000, nil
	})
	if err != nil {
		t.Fatalf("逐次延長の選択に失敗しました: %v", err)
	}
	want := []int{g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C"), g.GetOrAddID("D"), g.GetOrAddID("E"), g.GetOrAddID("F"), g.GetOrAddID("G")}
	if !reflect.DeepEqual(corrected, want) {
		t.Fatalf("5駅延長の候補が選択されませんでした: got=%v want=%v", corrected, want)
	}
}

func TestSequentialRouteExtensionsAcceptsPrivateEdges(t *testing.T) {
	g := graph.NewGraph(8)
	addFareExtensionEdge(g, "東京", "A", 1000, domain.JREast)
	addFareExtensionEdge(g, "A", "B", 900, domain.JREast)
	addFareExtensionEdge(g, "B", "C", 200, domain.Other)
	zones := extensionTestZones("東京", "A", 2000)
	input := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
	candidates := sequentialRouteExtensions(input, g, zones)
	want := []int{g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C")}
	if len(candidates) != 1 || !reflect.DeepEqual(candidates[0], want) {
		t.Fatalf("私鉄を含む逐次延長が生成されませんでした: got=%v want=%v", candidates, want)
	}
}

func TestSequentialRouteExtensionsMeasuresVirtualInputEdges(t *testing.T) {
	g := graph.NewGraph(16)
	addFareExtensionEdge(g, "A", "東京", 1000, domain.JREast)
	addFareExtensionEdge(g, "東京", "B", 900, domain.JREast)
	addFareExtensionEdge(g, "B", "X", 100, domain.JREast)
	addFareExtensionEdge(g, "X", "Y", 1100, domain.JREast)
	// L is a virtual temporary station. B→X remains the physical edge used for
	// measuring the input route, while B→L→X is present only in the full graph.
	virtualFrom := g.GetOrAddID("B")
	virtualStation := g.GetOrAddID("L")
	virtualTo := g.GetOrAddID("X")
	for _, edge := range []domain.Edge{
		{FromID: virtualFrom, ToID: virtualStation, EigyoKilo: 50, GiseiKilo: 50, Company: domain.JREast},
		{FromID: virtualStation, ToID: virtualFrom, EigyoKilo: 50, GiseiKilo: 50, Company: domain.JREast},
		{FromID: virtualStation, ToID: virtualTo, EigyoKilo: 50, GiseiKilo: 50, Company: domain.JREast},
		{FromID: virtualTo, ToID: virtualStation, EigyoKilo: 50, GiseiKilo: 50, Company: domain.JREast},
	} {
		g.AddEdge(ticketdomain.TicketEdge{Edge: edge})
	}
	// Mark the physical edge prefix after all physical edges have been added.
	g.PhysicalEdgeCounts = make([]int, len(g.Edges))
	for i, edges := range g.Edges {
		g.PhysicalEdgeCounts[i] = len(edges)
	}
	// The four virtual edges were appended last for their respective stations.
	g.PhysicalEdgeCounts[virtualFrom]--
	g.PhysicalEdgeCounts[virtualStation] -= 2
	g.PhysicalEdgeCounts[virtualTo]--

	zones := extensionTestZones("東京", "A", 2000)
	input := []int{g.GetOrAddID("A"), g.GetOrAddID("東京"), g.GetOrAddID("B"), virtualStation, virtualTo}
	candidates := sequentialRouteExtensions(input, g, zones)
	want := []int{g.GetOrAddID("A"), g.GetOrAddID("東京"), g.GetOrAddID("B"), virtualStation, virtualTo, g.GetOrAddID("Y")}
	if len(candidates) != 1 || !reflect.DeepEqual(candidates[0], want) {
		t.Fatalf("仮想入力エッジを含む逐次延長が生成されませんでした: got=%v want=%v", candidates, want)
	}
}

func TestSequentialRouteExtensionsTriesBothSidesWhenBothEndpointsAreInZones(t *testing.T) {
	g := graph.NewGraph(8)
	addFareExtensionEdge(g, "東京", "A", 1900, domain.JREast)
	addFareExtensionEdge(g, "A", "B", 10, domain.JREast)
	addFareExtensionEdge(g, "B", "C", 10, domain.JREast)
	addFareExtensionEdge(g, "A", "X", 200, domain.JREast)
	addFareExtensionEdge(g, "B", "Y", 200, domain.JREast)
	zone := ticketdomain.SpecialZone{Name: "東京都区内", MinDistanceDeciKilo: 2000, MaxDistanceDeciKilo: 1 << 30, Stations: []string{"A", "B"}}
	zones := &ticketgraphio.SpecialZoneRegistry{
		Zones:          []ticketdomain.SpecialZone{zone},
		StationToZones: map[string][]ticketdomain.SpecialZone{"A": {zone}, "B": {zone}},
	}
	input := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
	candidates := sequentialRouteExtensions(input, g, zones)
	if len(candidates) != 2 {
		t.Fatalf("両端ゾーンの片側延長候補数が不正です: got=%v", candidates)
	}
}

func TestSequentialRouteExtensionsStopsAtTenAddedStations(t *testing.T) {
	g := graph.NewGraph(20)
	addFareExtensionEdge(g, "東京", "A", 500, domain.JREast)
	addFareExtensionEdge(g, "A", "B", 400, domain.JREast)
	previous := "B"
	for i := 0; i < maxRouteExtensionDepth+1; i++ {
		station := fmt.Sprintf("X%d", i)
		addFareExtensionEdge(g, previous, station, 100, domain.JREast)
		previous = station
	}
	zones := extensionTestZones("東京", "A", 2000)
	input := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
	if got := sequentialRouteExtensions(input, g, zones); len(got) != 0 {
		t.Fatalf("11駅目で初めて閾値を超える分岐を候補にしました: %v", got)
	}
}

func extensionTestZones(center, station string, threshold domain.DeciKilo) *ticketgraphio.SpecialZoneRegistry {
	return extensionTestZonesNamed("東京都区内", station, threshold)
}

func extensionTestZonesNamed(name, station string, threshold domain.DeciKilo) *ticketgraphio.SpecialZoneRegistry {
	zone := ticketdomain.SpecialZone{Name: name, MinDistanceDeciKilo: threshold, MaxDistanceDeciKilo: 1 << 30, Stations: []string{station}}
	return &ticketgraphio.SpecialZoneRegistry{
		Zones:          []ticketdomain.SpecialZone{zone},
		StationToZones: map[string][]ticketdomain.SpecialZone{station: {zone}},
	}
}

func addFareExtensionEdge(g *graph.RailwayGraph, from, to string, eigyo domain.DeciKilo, company domain.CompanyID) {
	a := g.GetOrAddID(from)
	b := g.GetOrAddID(to)
	for _, edge := range []domain.Edge{
		{FromID: a, ToID: b, EigyoKilo: eigyo, GiseiKilo: eigyo, Company: company},
		{FromID: b, ToID: a, EigyoKilo: eigyo, GiseiKilo: eigyo, Company: company},
	} {
		g.AddEdge(ticketdomain.TicketEdge{Edge: edge})
	}
}

func TestRouteExtensionRegistryIsEmptyAfterRemovingArticle114Routes(t *testing.T) {
	registry, err := ticketfareio.NewRouteExtensionRegistry()
	if err != nil {
		t.Fatalf("対応表の読み込みに失敗しました: %v", err)
	}
	if got := len(registry.GetRouteExtensions()); got != 0 {
		t.Fatalf("削除済みの対応表にレコードが残っています: got=%d", got)
	}
}

func TestEmbeddedRouteExtensionsUsePhysicalJRPaths(t *testing.T) {
	loader := &ticketgraphio.JSONLoader{}
	_, g, err := loader.LoadSeparatedGraphs([]io.Reader{graphdata.GetEdgesReader()}, graphdata.GetFareGraphEdgeReaders())
	if err != nil {
		t.Fatalf("グラフの読み込みに失敗しました: %v", err)
	}
	registry, err := ticketfareio.NewRouteExtensionRegistry()
	if err != nil {
		t.Fatalf("対応表の読み込みに失敗しました: %v", err)
	}
	matcher, err := NewRouteExtensionMatcher(registry.GetRouteExtensions(), g)
	if err != nil {
		t.Fatalf("対応表の物理経路検証に失敗しました: %v", err)
	}
	if matcher == nil {
		t.Fatal("対応表Matcherがnilです")
	}
	if _, ok := matcher.Match([]int{g.GetOrAddID("ほしみ"), g.GetOrAddID("南永山")}); ok {
		t.Fatal("削除済みの第114条対応表が一致しました")
	}
}

func TestGeneratedRouteExtensionsUsePhysicalPaths(t *testing.T) {
	loader := &ticketgraphio.JSONLoader{}
	_, g, err := loader.LoadSeparatedGraphs([]io.Reader{graphdata.GetEdgesReader()}, graphdata.GetFareGraphEdgeReaders())
	if err != nil {
		t.Fatalf("グラフの読み込みに失敗しました: %v", err)
	}
	matcher, err := NewRouteExtensionMatcherIDs(ticketfareio.GetGeneratedRouteExtensions(), g)
	if err != nil {
		t.Fatalf("生成済み対応表の物理経路検証に失敗しました: %v", err)
	}
	if matcher == nil {
		t.Fatal("生成済み対応表Matcherがnilです")
	}
}

type extensionTestCorrector struct{}

func (extensionTestCorrector) Correct([]int, graph.Graph) ([]int, error) {
	return []int{99}, nil
}

func addExtensionTestEdge(g *graph.RailwayGraph, from, to string) {
	a := g.GetOrAddID(from)
	b := g.GetOrAddID(to)
	for _, edge := range []domain.Edge{
		{FromID: a, ToID: b, Company: domain.JREast},
		{FromID: b, ToID: a, Company: domain.JREast},
	} {
		g.AddEdge(ticketdomain.TicketEdge{Edge: edge})
	}
}
