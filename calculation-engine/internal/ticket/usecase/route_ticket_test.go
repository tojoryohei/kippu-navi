package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"reflect"
	"testing"
)

func TestRouteSplitExtendsTicketsButNeverSplitBoundaries(t *testing.T) {
	g := graph.NewGraph(4)
	addFareExtensionEdge(g, "A", "B", 100, domain.JREast)
	addFareExtensionEdge(g, "B", "C", 100, domain.JREast)
	specific := fare.NewPathMatcher()
	a, b, c := g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C")
	if err := specific.Insert([]int{a, b}, 500); err != nil {
		t.Fatal(err)
	}
	if err := specific.Insert([]int{a, b, c}, 100); err != nil {
		t.Fatal(err)
	}
	calc := NewCalculateAmount(fare.NewRegistry(), fare.NewAddonRegistry(), fare.NewTrainSpecificSectionCalculator(), specific, fare.NewPathMatcher(), nil, g, nil)
	zones := &graphio.SpecialZoneRegistry{StationToZones: map[string][]ticketdomain.SpecialZone{}}
	evaluator := NewTicketSegmentEvaluator(calc, NewSpecialZoneApplier(g, zones), nil, zones, g)
	extensions, err := NewRouteExtensionMatcher([]ticketdomain.RouteExtension{{InputPath: []string{"A", "B"}, OutputPath: []string{"A", "B", "C"}}}, g)
	if err != nil {
		t.Fatal(err)
	}
	calculator := NewRouteTicketCalculator(g, NewPipelineCorrector(), evaluator, extensions, zones)
	steps := []ViaStep{{StationName: "A"}, {StationName: "B"}}
	for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
		t.Run(mode, func(t *testing.T) {
			names, candidateErr := calculator.SplitCandidates(steps, mode)
			if candidateErr != nil || len(names) != 0 {
				t.Fatalf("unexpected candidates: %v %v", names, candidateErr)
			}
			var got *RouteSplitResult
			var err error
			logged := captureViaLog(t, func() {
				got, err = calculator.Split(steps, mode)
			})
			if logged != "" {
				t.Fatalf("split calculation logged kana codes: %q", logged)
			}
			if err != nil {
				t.Fatal(err)
			}
			if len(got.Results) != 1 || len(got.Results[0].Segments) != 1 {
				t.Fatalf("extension station became a boundary: %+v", got)
			}
			segment := got.Results[0].Segments[0]
			if segment.DepartureStation != "A" || segment.ArrivalStation != "B" {
				t.Fatalf("usage endpoints changed: %+v", segment)
			}
			wantFare, wantEnd := 500, "B"
			if mode == "cheapest" {
				wantFare, wantEnd = 100, "C"
			}
			if segment.Fare.Fare != wantFare || segment.Fare.ArrivalStation != wantEnd {
				t.Fatalf("mode %s: %+v", mode, segment)
			}
			baseline, _, err := calculator.Calculate([]int{a, b}, steps, mode)
			if err != nil || !reflect.DeepEqual(baseline, got.Normal) {
				t.Fatalf("baseline differs: %+v %+v %v", baseline, got.Normal, err)
			}
		})
	}
}

func TestRouteSplitStopsViaLinesAtTheCut(t *testing.T) {
	g := graph.NewGraph(3)
	addFareExtensionEdge(g, "A", "B", 100, domain.JREast)
	addFareExtensionEdge(g, "B", "C", 100, domain.JREast)
	a, b, c := g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C")
	specific := fare.NewPathMatcher()
	for _, rule := range []struct {
		path   []int
		amount int
	}{{[]int{a, b}, 100}, {[]int{b, c}, 100}, {[]int{a, b, c}, 500}} {
		if err := specific.Insert(rule.path, rule.amount); err != nil {
			t.Fatal(err)
		}
	}
	zones := &graphio.SpecialZoneRegistry{StationToZones: map[string][]ticketdomain.SpecialZone{}}
	calc := NewCalculateAmount(fare.NewRegistry(), fare.NewAddonRegistry(), fare.NewTrainSpecificSectionCalculator(), specific, fare.NewPathMatcher(), nil, g, nil)
	evaluator := NewTicketSegmentEvaluator(calc, NewSpecialZoneApplier(g, zones), nil, zones, g)
	calculator := NewRouteTicketCalculator(g, NewPipelineCorrector(), evaluator, nil, zones)
	steps := []ViaStep{{StationName: "A", LineName: "トウカ"}, {StationName: "B", LineName: "チユト"}, {StationName: "C"}}
	for _, mode := range []string{"normal", "uncorrect"} {
		got, err := calculator.Split(steps, mode)
		if err != nil {
			t.Fatal(err)
		}
		if len(got.Results) != 1 || len(got.Results[0].Segments) != 2 {
			t.Fatalf("unexpected plans: %+v", got)
		}
		first := got.Results[0].Segments[0].Fare.PrintedViaLines
		if !reflect.DeepEqual(first, []string{"東海道"}) {
			t.Fatalf("outgoing line leaked into first ticket: %v", first)
		}
		if steps[1].LineName != "チユト" {
			t.Fatal("input route mutated")
		}
	}
}
