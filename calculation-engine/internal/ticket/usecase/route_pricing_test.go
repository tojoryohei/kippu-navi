package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
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
