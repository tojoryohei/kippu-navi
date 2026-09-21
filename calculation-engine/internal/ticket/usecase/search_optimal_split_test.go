package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"math"
	"reflect"
	"testing"
)

func TestSearchUnlimitedSplit(t *testing.T) {
	g := graph.NewGraph(4)
	path := []int{
		g.GetOrAddID("A"),
		g.GetOrAddID("B"),
		g.GetOrAddID("C"),
		g.GetOrAddID("D"),
	}

	t.Run("区間数が異なる同額の解をすべて返す", func(t *testing.T) {
		fares := unavailableFares(4)
		fares[0*4+3] = 100
		fares[0*4+1] = 40
		fares[1*4+3] = 60

		search := NewSearchOptimalSplit(g, nil)
		search.SetPrecomputedFares(fares)
		cost, results := search.searchUnlimitedSplit(path)

		if cost != 100 {
			t.Fatalf("運賃 = %d, want 100", cost)
		}
		want := [][]int{{0, 3}, {0, 1, 3}}
		if !reflect.DeepEqual(results, want) {
			t.Fatalf("結果 = %v, want %v", results, want)
		}
	})

	t.Run("同額かつ同じ区間数の解をすべて返す", func(t *testing.T) {
		fares := unavailableFares(4)
		fares[0*4+3] = 100
		fares[0*4+1] = 40
		fares[1*4+3] = 50
		fares[0*4+2] = 50
		fares[2*4+3] = 40

		search := NewSearchOptimalSplit(g, nil)
		search.SetPrecomputedFares(fares)
		cost, results := search.searchUnlimitedSplit(path)

		if cost != 90 {
			t.Fatalf("運賃 = %d, want 90", cost)
		}
		want := [][]int{{0, 1, 3}, {0, 2, 3}}
		if !reflect.DeepEqual(results, want) {
			t.Fatalf("結果 = %v, want %v", results, want)
		}
	})
}

func TestSearchUnlimitedSplitLockedStation(t *testing.T) {
	g := graph.NewGraph(4)
	path := []int{
		g.GetOrAddID("A"),
		g.GetOrAddID("B"),
		g.GetOrAddID("C"),
		g.GetOrAddID("D"),
	}
	fares := unavailableFares(4)
	fares[0*4+3] = 100
	fares[0*4+1] = 40
	fares[1*4+3] = 50
	fares[0*4+2] = 60
	fares[2*4+3] = 40

	search := NewSearchOptimalSplit(g, nil)
	search.SetPrecomputedFares(fares)
	cost, results := search.searchUnlimitedSplitWithLocks(path, makeLockedStationSet([]int{path[1]}))
	if cost != 100 {
		t.Fatalf("運賃 = %d, want 100", cost)
	}
	for _, result := range results {
		for _, station := range result[1 : len(result)-1] {
			if station == path[1] {
				t.Fatalf("分割禁止駅が境界に含まれています: %v", result)
			}
		}
	}
}

func TestSearchOptimalSplit_ShibuyaMito_KairakuenLocked(t *testing.T) {
	g := graph.NewGraph(3)
	shibuya := g.GetOrAddID("渋谷")
	kairakuen := g.GetOrAddID("偕楽園")
	ryugasakishi := g.GetOrAddID("龍ケ崎市")
	mito := g.GetOrAddID("水戸")

	// 実際の経路と同じ駅名で、偕楽園経由と龍ケ崎市経由の候補を構成します。
	// 通し運賃より偕楽園での分割が安く、偕楽園を禁止すると龍ケ崎市での分割が安くなる設定です。
	add := func(from, to int) {
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
			FromID: from, ToID: to, EigyoKilo: 100, GiseiKilo: 100, Company: domain.JREast,
		}})
	}
	add(shibuya, kairakuen)
	add(kairakuen, shibuya)
	add(kairakuen, mito)
	add(mito, kairakuen)
	add(shibuya, ryugasakishi)
	add(ryugasakishi, shibuya)
	add(ryugasakishi, mito)
	add(mito, ryugasakishi)

	fares := unavailableFares(4)
	fares[shibuya*4+mito] = 5000
	fares[shibuya*4+kairakuen] = 1500
	fares[kairakuen*4+mito] = 1000
	fares[shibuya*4+ryugasakishi] = 3000
	fares[ryugasakishi*4+mito] = 1000

	search := NewSearchOptimalSplit(g, nil)
	search.SetPrecomputedFares(fares)

	got, err := search.ExecuteWithOptions(shibuya, mito, 0, nil)
	if err != nil {
		t.Fatalf("偕楽園を分割境界にした探索が失敗しました: %v", err)
	}
	if !containsPath(got, []int{shibuya, kairakuen, mito}) {
		t.Fatalf("偕楽園分割が最安候補に含まれていません: %v", got)
	}

	lockedGot, err := search.ExecuteWithOptions(shibuya, mito, 0, []int{kairakuen})
	if err != nil {
		t.Fatalf("偕楽園を分割禁止にした探索が失敗しました: %v", err)
	}
	want := [][]int{{shibuya, ryugasakishi, mito}}
	if !reflect.DeepEqual(lockedGot, want) {
		t.Fatalf("偕楽園を分割禁止にした結果 = %v, want %v", lockedGot, want)
	}
}

func unavailableFares(numStations int) []int32 {
	fares := make([]int32, numStations*numStations)
	for i := range fares {
		fares[i] = math.MaxInt32
	}
	return fares
}

func TestSearchOptimalSplitFindsCheaperPathOutsideLegacyMargin(t *testing.T) {
	g := graph.NewGraph(4)
	a := g.GetOrAddID("A")
	b := g.GetOrAddID("B")
	c := g.GetOrAddID("C")
	d := g.GetOrAddID("D")
	add := func(from, to int, distance domain.DeciKilo) {
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: from, ToID: to, EigyoKilo: distance, GiseiKilo: distance, Company: domain.JREast}})
	}
	add(a, b, 10)
	add(a, c, 30)
	add(c, d, 30)
	add(d, b, 30) // 90 DeciKilo: old shortest+50 cut-off was 60.

	fares := unavailableFares(4)
	fares[a*4+b] = 1000
	fares[a*4+c] = 100
	fares[c*4+d] = 100
	fares[d*4+b] = 100
	search := NewSearchOptimalSplit(g, nil)
	search.SetPrecomputedFares(fares)

	got, err := search.Execute(a, b, 0)
	if err != nil {
		t.Fatal(err)
	}
	if !containsPath(got, []int{a, c, d, b}) {
		t.Fatalf("固定上限外の最安経路がありません: %v", got)
	}
}

func TestSearchOptimalSplitExcludesPathAboveCalculatedLimit(t *testing.T) {
	g := graph.NewGraph(4)
	a := g.GetOrAddID("A")
	b := g.GetOrAddID("B")
	c := g.GetOrAddID("C")
	d := g.GetOrAddID("D")
	add := func(from, to int, distance domain.DeciKilo) {
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: from, ToID: to, EigyoKilo: distance, GiseiKilo: distance, Company: domain.JREast}})
	}
	add(a, b, 10) // limit = 10 + 100 = 110
	add(a, c, 37)
	add(c, d, 37)
	add(d, b, 37) // 111: one DeciKilo above the limit
	if err := g.Validate(); err != nil {
		t.Fatal(err)
	}
	fares := unavailableFares(4)
	fares[a*4+b] = 1000
	fares[a*4+c], fares[c*4+d], fares[d*4+b] = 100, 100, 100
	search := NewSearchOptimalSplit(g, nil)
	search.SetPrecomputedFares(fares)

	got, err := search.Execute(a, b, 0)
	if err != nil {
		t.Fatal(err)
	}
	if containsPath(got, []int{a, c, d, b}) {
		t.Fatalf("上限超過経路が含まれています: %v", got)
	}
}
