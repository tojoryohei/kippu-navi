package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"errors"
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

		search := NewSearchOptimalSplit(g, nil, nil)
		search.SetPrecomputedFares(fares)
		cost, results := search.searchUnlimitedSplit(path)

		if cost != 100 {
			t.Fatalf("運賃 = %d, 期待値 100", cost)
		}
		want := [][]int{{0, 3}, {0, 1, 3}}
		if !reflect.DeepEqual(results, want) {
			t.Fatalf("結果 = %v, 期待値 %v", results, want)
		}
	})

	t.Run("同額かつ同じ区間数の解をすべて返す", func(t *testing.T) {
		fares := unavailableFares(4)
		fares[0*4+3] = 100
		fares[0*4+1] = 40
		fares[1*4+3] = 50
		fares[0*4+2] = 50
		fares[2*4+3] = 40

		search := NewSearchOptimalSplit(g, nil, nil)
		search.SetPrecomputedFares(fares)
		cost, results := search.searchUnlimitedSplit(path)

		if cost != 90 {
			t.Fatalf("運賃 = %d, 期待値 90", cost)
		}
		want := [][]int{{0, 1, 3}, {0, 2, 3}}
		if !reflect.DeepEqual(results, want) {
			t.Fatalf("結果 = %v, 期待値 %v", results, want)
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

	search := NewSearchOptimalSplit(g, nil, nil)
	search.SetPrecomputedFares(fares)
	cost, results := search.searchUnlimitedSplitWithLocks(path, makeLockedStationSet([]int{path[1]}))
	if cost != 100 {
		t.Fatalf("運賃 = %d, 期待値 100", cost)
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

	search := NewSearchOptimalSplit(g, nil, nil)
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
		t.Fatalf("偕楽園を分割禁止にした結果 = %v, 期待値 %v", lockedGot, want)
	}
}

func unavailableFares(numStations int) []int32 {
	fares := make([]int32, numStations*numStations)
	for i := range fares {
		fares[i] = math.MaxInt32
	}
	return fares
}

func TestStreamingSearchWaitsForCheapestCandidate(t *testing.T) {
	g := graph.NewGraph(4)
	a, b, c, d := g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C"), g.GetOrAddID("D")
	add := func(x, y, k int) {
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: x, ToID: y, EigyoKilo: domain.DeciKilo(k), GiseiKilo: domain.DeciKilo(k), Company: domain.JREast}})
	}
	add(a, b, 100)
	add(b, d, 100)
	add(a, c, 110)
	add(c, d, 110)
	fares := unavailableFares(4)
	fares[a*4+d] = 500
	fares[a*4+b] = 200
	fares[b*4+d] = 200
	fares[a*4+c] = 100
	fares[c*4+d] = 100
	search := NewSearchOptimalSplit(g, nil, nil)
	search.SetPrecomputedFares(fares)
	for _, equalFare := range []bool{false, true} {
		fares[a*4+b], fares[b*4+d] = 200, 200
		if equalFare {
			fares[a*4+b], fares[b*4+d] = 100, 100
		}
		for _, limit := range []int{0, 2} {
			for _, locked := range [][]int{nil, {c}} {
				expected := [][]int{{a, c, d}}
				if locked != nil {
					expected = [][]int{{a, b, d}}
				} else if equalFare {
					expected = [][]int{{a, b, d}, {a, c, d}}
				}
				want, err := search.ExecuteWithOptions(a, d, limit, locked)
				if err != nil || !reflect.DeepEqual(want, expected) {
					t.Fatalf("equalFare=%v limit=%d locked=%v: 結果=%v 期待値=%v (%v)", equalFare, limit, locked, want, expected, err)
				}
				var got [][]int
				remaining, err := search.ExecuteWithOptions(a, d, limit, locked, func(path []int) { got = append(got, path) })
				if err != nil || len(remaining) != 0 || !reflect.DeepEqual(got, want) {
					t.Fatalf("limit=%d locked=%v: %v != %v (%v)", limit, locked, got, want, err)
				}
				// 保持した結果の変更が、他の候補や次の探索に伝播しないことを確認する。
				got[0][0] = -1
				if len(got) > 1 && !reflect.DeepEqual(got[1:], expected[1:]) {
					t.Fatalf("他の候補が変更されました: %v", got)
				}
				got = nil
				_, err = search.ExecuteWithOptions(a, d, limit, locked, func(path []int) {
					got = append(got, append([]int(nil), path...))
					// 通知中の変更も、後続候補の生成に影響してはいけない。
					for i := range path {
						path[i] = -1
					}
				})
				if err != nil || !reflect.DeepEqual(got, expected) {
					t.Fatalf("visitorによる変更が探索に伝播しました: %v != %v (%v)", got, expected, err)
				}
			}
		}
	}
}

func TestDisconnectedSearchPreservesNoPathError(t *testing.T) {
	g := graph.NewGraph(4)
	a, b, c, d := g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C"), g.GetOrAddID("D")
	for _, pair := range [][2]int{{a, b}, {b, a}, {c, d}, {d, c}} {
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: pair[0], ToID: pair[1], EigyoKilo: 10, GiseiKilo: 10}})
	}
	// WASMの探索用ビューと同じく、連結成分の事前計算なしでも原因を保持する。
	search := NewSearchOptimalSplit(g, nil, nil)
	notified := false
	_, err := search.ExecuteWithOptions(a, d, 0, nil, func([]int) { notified = true })
	if !errors.Is(err, domain.ErrNoPathExists) || notified {
		t.Fatalf("err=%v, notified=%v", err, notified)
	}
	_, err = search.GetCheapestTicketSegments(a, d)
	if !errors.Is(err, domain.ErrNoPathExists) {
		t.Fatalf("分割前のエラー=%v", err)
	}
}

func TestCityCenterDetourFindsCheaperSplitInBothDirections(t *testing.T) {
	g := graph.NewGraph(3)
	city := g.GetOrAddID("井原市")
	center := g.GetOrAddID("広島")
	outside := g.GetOrAddID("児島")
	fares := unavailableFares(3)
	connect := func(a, b int, distance domain.DeciKilo, fare int) {
		for _, pair := range [][2]int{{a, b}, {b, a}} {
			from, to := pair[0], pair[1]
			g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: from, ToID: to, EigyoKilo: distance, GiseiKilo: distance}})
			fares[from*3+to] = int32(fare)
		}
	}
	// 中心駅経由は直通より10 km長く、下限の7.5 kmでは候補から外れる。
	connect(city, outside, 300, 500)
	connect(city, center, 150, 200)
	connect(center, outside, 250, 200)
	zones := &graphio.SpecialZoneRegistry{StationToZones: map[string][]ticketdomain.SpecialZone{"井原市": {{Name: "広島市内"}}}}
	search := NewSearchOptimalSplit(g, nil, zones)
	search.SetPrecomputedFares(fares)
	for _, pair := range [][2]int{{city, outside}, {outside, city}} {
		got, err := search.Execute(pair[0], pair[1], 0)
		want := [][]int{{pair[0], center, pair[1]}}
		if err != nil || !reflect.DeepEqual(got, want) {
			t.Fatalf("Execute(%v) の結果=%v、エラー=%v、期待値=%v", pair, got, err, want)
		}
	}
}

func TestCalculateUnsplitTicketComparesCandidatesInCheapestMode(t *testing.T) {
	g := graph.NewGraph(5)
	addFareExtensionEdge(g, "A", "新茂原", 1000, domain.JREast)
	addFareExtensionEdge(g, "A", "X", 500, domain.JREast)
	addFareExtensionEdge(g, "X", "新茂原", 505, domain.JREast)
	b, _ := g.GetID("新茂原")
	c := g.GetOrAddID("茂原")
	g.AddEdge(ticketdomain.TicketEdge{
		Line: "ソトボ",
		Edge: domain.Edge{FromID: b, ToID: c, Company: domain.JREast, EigyoKilo: 100, GiseiKilo: 100},
	})
	calculator := pricingTestCalculator(t, g, map[string]int{"A 新茂原": 500, "A X 新茂原": 700, "A X 新茂原 茂原": 400})
	extensions, err := NewRouteExtensionMatcher([]ticketdomain.RouteExtension{
		{InputPath: []string{"A", "X", "新茂原"}, OutputPath: []string{"A", "X", "新茂原", "茂原"}},
	}, g)
	if err != nil {
		t.Fatal(err)
	}
	calculator.extensions = extensions
	search := NewSearchOptimalSplit(g, calculator.evaluator, calculator.zones)
	a, _ := g.GetID("A")

	fare, result, err := search.CalculateUnsplitTicket(a, b, calculator)
	if err != nil {
		t.Fatal(err)
	}
	if fare.Fare != 400 || result.TotalAmount() != 400 || fare.ArrivalStation != "茂原" || !reflect.DeepEqual(fare.PrintedViaLines, []string{"外房"}) {
		t.Fatalf("分割前の券面 = %+v", fare)
	}

	segments, err := search.GetCheapestTicketSegments(a, b)
	if err != nil || len(segments) != 1 || segments[0].Result.TotalAmount() != 500 {
		t.Fatalf("分割区間の評価 = %+v, %v", segments, err)
	}
}
