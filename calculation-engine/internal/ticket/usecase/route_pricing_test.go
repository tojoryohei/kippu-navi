package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"fmt"
	"slices"
	"strings"
	"testing"
)

func pricingTestCalculator(t testing.TB, g *graph.RailwayGraph, prices map[string]int) *RouteTicketCalculator {
	t.Helper()
	matcher := fare.NewPathMatcher()
	// 候補ごとの運賃を固定し、探索結果を実際の運賃表から独立させる。
	for key, amount := range prices {
		var ids []int
		for _, name := range strings.Fields(key) {
			ids = append(ids, g.GetOrAddID(name))
		}
		if err := matcher.Insert(ids, amount); err != nil {
			t.Fatal(err)
		}
	}
	zones := &graphio.SpecialZoneRegistry{StationToZones: map[string][]ticketdomain.SpecialZone{}}
	calc := NewCalculateAmount(fare.NewRegistry(), nil, fare.NewTrainSpecificSectionCalculator(), matcher, nil, nil, g, nil)
	evaluator := NewTicketSegmentEvaluator(calc, NewSpecialZoneApplier(g, zones), nil, zones, g)
	return NewRouteTicketCalculator(g, NewPipelineCorrector(), evaluator, nil, zones)
}

func TestPricingComparesExistingExtensionsAfterDiscount(t *testing.T) {
	g := graph.NewGraph(3)
	addFareExtensionEdge(g, "A", "B", 950, domain.JREast)
	addFareExtensionEdge(g, "B", "C", 60, domain.JRCentral)
	calc := pricingTestCalculator(t, g, map[string]int{"A B": 1000, "A B C": 900})
	var err error
	calc.extensions, err = NewRouteExtensionMatcher([]ticketdomain.RouteExtension{{InputPath: []string{"A", "B"}, OutputPath: []string{"A", "B", "C"}}}, g)
	if err != nil {
		t.Fatal(err)
	}
	path := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
	steps := []ViaStep{{StationName: "A"}, {StationName: "B"}}
	for _, tc := range []struct {
		passenger, discount string
		wantEnd             string
		wantFare            int
		applied             bool
	}{
		{"adult", "none", "C", 900, false},
		{"child", "none", "C", 450, false},
		{"adult", "east40", "B", 600, true},
		{"adult", "student", "C", 720, true},
	} {
		got, err := calc.CalculateWithPricing(path, steps, "cheapest", TicketPricingOptions{tc.passenger, tc.discount})
		if err != nil || got.ArrivalStation != tc.wantEnd || got.Fare != tc.wantFare || got.DiscountApplied != tc.applied {
			t.Fatalf("利用者=%s、割引=%s: 結果=%+v、エラー=%v", tc.passenger, tc.discount, got, err)
		}
		wantDistance := domain.DeciKilo(950)
		if tc.wantEnd == "C" {
			wantDistance += 60
		}
		if got.TotalEigyoKilo != int(wantDistance) || got.CorrectedDistances[domain.JREast].EigyoKilo+got.CorrectedDistances[domain.JRCentral].EigyoKilo != wantDistance {
			t.Fatalf("採用経路と距離表が不一致: %+v", got)
		}
	}
	baseline, _, err := calc.Calculate(path, steps, "cheapest")
	if err != nil || baseline.ArrivalStation != "C" || baseline.Fare != 900 {
		t.Fatalf("既存の大人運賃計算が変化: %+v、%v", baseline, err)
	}
}

func TestPricingSuburbanCompanyConditionIncludesBothJRSides(t *testing.T) {
	g := graph.NewGraph(5)
	addFareExtensionEdge(g, "A", "B", 80, domain.JRCentral)
	addFareExtensionEdge(g, "A", "X", 50, domain.JREast)
	addFareExtensionEdge(g, "X", "B", 50, domain.JREast)
	addFareExtensionEdge(g, "B", "C", 10, domain.Other)
	addFareExtensionEdge(g, "C", "D", 100, domain.JRCentral)
	for id := range g.Edges {
		for i := range g.Edges[id] {
			edge := &g.Edges[id][i]
			if edge.Company != domain.Other {
				edge.SuburbanArea = domain.SuburbanAreaTokyo
			}
			if (g.GetName(id) == "A" && g.GetName(edge.ToID) == "B") || (g.GetName(id) == "B" && g.GetName(edge.ToID) == "A") {
				edge.GiseiKilo = 1000
			}
		}
	}
	calc := pricingTestCalculator(t, g, map[string]int{"A B": 500, "A X B": 700, "C D": 200, "A B C D": 1000, "A X B C D": 1100})
	calc.corrector = NewSuburbanAreaCorrector(nil)
	path := []int{g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C"), g.GetOrAddID("D")}
	steps := []ViaStep{{StationName: "A"}, {StationName: "B"}, {StationName: "C"}, {StationName: "D"}}
	got, err := calc.CalculateWithPricing(path, steps, "normal", TicketPricingOptions{DiscountID: "east40"})
	// 東日本側だけを先に割引すると遠回りを選ぶが、私鉄の先に東海があるので全体では割引不可。
	if err != nil || got.Fare != 1000 || got.DiscountApplied {
		t.Fatalf("JR全体の会社条件で比較していない: %+v、%v", got, err)
	}
}

func TestPricingDoesNotCombineBothEnds(t *testing.T) {
	g := graph.NewGraph(4)
	addFareExtensionEdge(g, "X", "A", 60, domain.JREast)
	addFareExtensionEdge(g, "A", "B", 900, domain.JREast)
	addFareExtensionEdge(g, "B", "Y", 60, domain.JREast)
	calc := pricingTestCalculator(t, g, map[string]int{"A B": 1000, "X A B": 1000, "A B Y": 1000, "X A B Y": 1000})
	input := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
	steps := []ViaStep{{StationName: "A"}, {StationName: "B"}}
	got, err := calc.CalculateWithPricing(input, steps, "cheapest", TicketPricingOptions{DiscountID: "student"})
	// 両端を延ばせば割引対象になるが、片側だけでは閾値を超えない。
	if err != nil || got.DepartureStation != "A" || got.ArrivalStation != "B" || got.Fare != 1000 || got.DiscountApplied {
		t.Fatalf("両端延長を採用した: %+v、%v", got, err)
	}
}

func TestPricingFirstExtensionBeyondTenStations(t *testing.T) {
	g := graph.NewGraph(20)
	for i := 0; i < 15; i++ {
		addFareExtensionEdge(g, fmt.Sprint(i), fmt.Sprint(i+1), 10, domain.JREast)
	}
	input := []int{g.GetOrAddID("0"), g.GetOrAddID("1")}
	got, err := firstPricingExtension(input, g, extendDestination, 120, nil, func(p []int) (*pricedRouteCandidate, error) {
		return &pricedRouteCandidate{result: &CalculationResult{TotalEigyoKilo: domain.DeciKilo((len(p) - 1) * 10)}}, nil
	})
	if err != nil || got == nil || got.result.TotalEigyoKilo != 130 {
		t.Fatalf("結果=%+v、エラー=%v", got, err)
	}
}

type thresholdTestCorrector struct{}

func (thresholdTestCorrector) Correct(path []int, _ graph.Graph) ([]int, error) {
	if len(path) == 3 {
		return slices.Clone(path[:2]), nil
	}
	return slices.Clone(path), nil
}

func TestPricingContinuesAfterCorrectedDistanceFallsBelowThreshold(t *testing.T) {
	g := graph.NewGraph(4)
	addFareExtensionEdge(g, "A", "B", 950, domain.JREast)
	addFareExtensionEdge(g, "B", "C", 60, domain.JREast)
	addFareExtensionEdge(g, "C", "D", 20, domain.JREast)
	calc := pricingTestCalculator(t, g, map[string]int{"A B": 1000, "A B C D": 1000})
	calc.corrector = thresholdTestCorrector{}
	var err error
	calc.extensions, err = NewRouteExtensionMatcher([]ticketdomain.RouteExtension{{InputPath: []string{"A", "B"}, OutputPath: []string{"A", "B", "C"}}}, g)
	if err != nil {
		t.Fatal(err)
	}
	p := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
	got, err := calc.CalculateWithPricing(p, []ViaStep{{StationName: "A"}, {StationName: "B"}}, "cheapest", TicketPricingOptions{DiscountID: "student"})
	if err != nil || got.ArrivalStation != "D" || got.Fare != 800 || !got.DiscountApplied {
		t.Fatalf("%+v %v", got, err)
	}
	if got.InputDistances[domain.JREast] != (CompanyDistance{950, 950}) || got.CorrectedDistances[domain.JREast] != (CompanyDistance{1030, 1030}) {
		t.Fatalf("延長前後の距離が不正: 入力=%+v、補正後=%+v", got.InputDistances, got.CorrectedDistances)
	}
}

func TestPricingExtensionCompletesOverlapDeduction(t *testing.T) {
	g := graph.NewGraph(5)
	for _, edge := range [][2]string{{"御茶ノ水", "神田"}, {"神田", "東京"}, {"神田", "秋葉原"}, {"秋葉原", "御徒町"}} {
		addFareExtensionEdge(g, edge[0], edge[1], 450, domain.JREast)
	}
	calc := pricingTestCalculator(t, g, map[string]int{"御茶ノ水 神田 東京": 1000, "御茶ノ水 神田 秋葉原 御徒町": 1100})
	calc.corrector = NewPipelineCorrector(NewShinkansenOverlapCorrector())
	path := []int{g.GetOrAddID("御茶ノ水"), g.GetOrAddID("神田"), g.GetOrAddID("東京")}
	steps := []ViaStep{{StationName: "御茶ノ水"}, {StationName: "神田"}, {StationName: "東京"}}
	got, err := calc.CalculateWithPricing(path, steps, "cheapest", TicketPricingOptions{DiscountID: "student"})
	// 東京→神田の時点は重複するが、秋葉原まで進むと折り返しを控除できる。
	if err != nil || got.ArrivalStation != "御徒町" || got.TotalEigyoKilo != 1350 || got.Fare != 880 || !got.DiscountApplied {
		t.Fatalf("折り返し控除を伴う延長を採用できない: %+v、%v", got, err)
	}
}

func TestPricingKeepsCheaperBaselineAndCompanyConditions(t *testing.T) {
	for _, tc := range []struct {
		company                 domain.CompanyID
		extensionFare, wantFare int
		wantEnd                 string
		applied                 bool
	}{
		{domain.JREast, 1100, 770, "C", true},
		{domain.JRCentral, 1100, 1000, "B", false},
		{domain.JREast, 1800, 1000, "B", false},
	} {
		g := graph.NewGraph(3)
		addFareExtensionEdge(g, "A", "B", 950, domain.JREast)
		addFareExtensionEdge(g, "B", "C", 60, tc.company)
		calc := pricingTestCalculator(t, g, map[string]int{"A B": 1000, "A B C": tc.extensionFare})
		p := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
		got, err := calc.CalculateWithPricing(p, []ViaStep{{StationName: "A"}, {StationName: "B"}}, "cheapest", TicketPricingOptions{DiscountID: "otona30"})
		if err != nil || got.Fare != tc.wantFare || got.DiscountApplied != tc.applied || got.ArrivalStation != tc.wantEnd {
			t.Fatalf("延長後の会社=%v、運賃=%d: 結果=%+v、エラー=%v", tc.company, tc.extensionFare, got, err)
		}
	}
}

func TestPricingExtensionOrderAndSingleCandidate(t *testing.T) {
	for _, tc := range []struct {
		name               string
		originFare         int
		wantStart, wantEnd string
		wantFare           int
	}{
		{"着側が安い", 1200, "A", "Y", 880},
		{"発側がさらに安い", 900, "X", "B", 720},
		{"同額は着側を維持", 1100, "A", "Y", 880},
	} {
		t.Run(tc.name, func(t *testing.T) {
			g := graph.NewGraph(5)
			addFareExtensionEdge(g, "A", "B", 950, domain.JREast)
			addFareExtensionEdge(g, "B", "Y", 60, domain.JREast)
			addFareExtensionEdge(g, "B", "Z", 60, domain.JREast)
			addFareExtensionEdge(g, "X", "A", 60, domain.JREast)
			calc := pricingTestCalculator(t, g, map[string]int{"A B": 1000, "A B Y": 1100, "A B Z": 600, "X A B": tc.originFare, "X A B Y": 100})
			got, err := calc.CalculateWithPricing([]int{g.GetOrAddID("A"), g.GetOrAddID("B")}, []ViaStep{{StationName: "A"}, {StationName: "B"}}, "cheapest", TicketPricingOptions{DiscountID: "student"})
			if err != nil || got.DepartureStation != tc.wantStart || got.ArrivalStation != tc.wantEnd || got.Fare != tc.wantFare {
				t.Fatalf("%+v %v", got, err)
			}
			for _, mode := range []string{"normal", "uncorrect"} {
				original, err := calc.CalculateWithPricing([]int{g.GetOrAddID("A"), g.GetOrAddID("B")}, []ViaStep{{StationName: "A"}, {StationName: "B"}}, mode, TicketPricingOptions{DiscountID: "student"})
				if err != nil || original.DepartureStation != "A" || original.ArrivalStation != "B" || original.Fare != 1000 || original.DiscountApplied {
					t.Fatalf("%sで延長した: %+v、%v", mode, original, err)
				}
			}
		})
	}
}

func TestPricingNoExtensionWithinSuburbanArea(t *testing.T) {
	g := graph.NewGraph(3)
	addFareExtensionEdge(g, "A", "B", 950, domain.JREast)
	addFareExtensionEdge(g, "B", "C", 60, domain.JREast)
	for _, name := range []string{"A", "B"} {
		id, _ := g.GetID(name)
		for i := range g.Edges[id] {
			if g.GetName(g.Edges[id][i].ToID) != "C" {
				g.Edges[id][i].SuburbanArea = domain.SuburbanAreaTokyo
			}
		}
	}
	calc := pricingTestCalculator(t, g, map[string]int{"A B": 1000, "A B C": 500})
	var err error
	calc.extensions, err = NewRouteExtensionMatcher([]ticketdomain.RouteExtension{{InputPath: []string{"A", "B"}, OutputPath: []string{"A", "B", "C"}}}, g)
	if err != nil {
		t.Fatal(err)
	}
	for _, discount := range []string{"none", "student"} {
		got, err := calc.CalculateWithPricing([]int{g.GetOrAddID("A"), g.GetOrAddID("B")}, []ViaStep{{StationName: "A"}, {StationName: "B"}}, "cheapest", TicketPricingOptions{DiscountID: discount})
		if err != nil || got.Fare != 1000 || got.ArrivalStation != "B" {
			t.Fatalf("%s: %+v %v", discount, got, err)
		}
	}
}

func TestPricingThresholdAt100UsesExistingExtensionsOnly(t *testing.T) {
	for _, distance := range []domain.DeciKilo{1000, 1001} {
		g := graph.NewGraph(3)
		addFareExtensionEdge(g, "A", "B", distance, domain.JREast)
		addFareExtensionEdge(g, "B", "C", 60, domain.JREast)
		calc := pricingTestCalculator(t, g, map[string]int{"A B": 1000, "A B C": 500})
		input := []int{g.GetOrAddID("A"), g.GetOrAddID("B")}
		steps := []ViaStep{{StationName: "A"}, {StationName: "B"}}
		got, err := calc.CalculateWithPricing(input, steps, "cheapest", TicketPricingOptions{DiscountID: "student"})
		if err != nil || got.ArrivalStation != "B" {
			t.Fatalf("%+v %v", got, err)
		}
		calc.extensions, err = NewRouteExtensionMatcher([]ticketdomain.RouteExtension{{InputPath: []string{"A", "B"}, OutputPath: []string{"A", "B", "C"}}}, g)
		if err != nil {
			t.Fatal(err)
		}
		got, err = calc.CalculateWithPricing(input, steps, "cheapest", TicketPricingOptions{DiscountID: "student"})
		if err != nil || got.ArrivalStation != "C" || got.Fare != 400 {
			t.Fatalf("既存延長: %+v %v", got, err)
		}
	}
}
