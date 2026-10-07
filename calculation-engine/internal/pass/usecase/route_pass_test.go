package usecase

import (
	"calculation-engine/internal/domain"
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"fmt"
	"reflect"
	"testing"
)

type routePassEvaluationFunc func([]int, int) (*CalculationResult, error)

func (f routePassEvaluationFunc) Execute(p []int, m int) (*CalculationResult, error) { return f(p, m) }

func TestRoutePassCorrectionAndExtensionBoundaries(t *testing.T) {
	g := graph.NewGraph(5)
	id := func(name string) int { return g.GetOrAddID(name) }
	a, b, c, d, x := id("A"), id("B"), id("C"), id("D"), id("X")
	for _, pair := range [][2]int{{a, b}, {b, c}, {c, d}, {a, x}, {x, d}} {
		for _, ends := range [][2]int{pair, {pair[1], pair[0]}} {
			g.AddEdge(passdomain.PassEdge{Line: "トウホ", Edge: domain.Edge{FromID: ends[0], ToID: ends[1], Company: domain.JREast, EigyoKilo: 10, GiseiKilo: 10}})
		}
	}
	rules := []passdomain.ResolvedBypassRule{{ShortcutPath: []int{a, b, c, d}, DetourPath: []int{a, x, d}}}
	evaluator := routePassEvaluationFunc(func(path []int, months int) (*CalculationResult, error) {
		amount := 800
		if reflect.DeepEqual(path, []int{a, b, c, d}) {
			amount = 600
		}
		return &CalculationResult{Fare: amount * months, BarrierFreeFee: 7 * months, Charge: 11 * months}, nil
	})
	calculator := NewRoutePassCalculator(g, evaluator, rules)
	for _, months := range []int{1, 3, 6} {
		for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
			result, err := calculator.Split([]string{"B", "C"}, months, mode)
			if err != nil {
				t.Fatal(err)
			}
			if len(result.Results) != 1 || len(result.Results[0].Segments) != 1 {
				t.Fatalf("unexpected cuts: %+v", result)
			}
			segment := result.Results[0].Segments[0]
			if segment.DepartureStation != "B" || segment.ArrivalStation != "C" {
				t.Fatal("extension changed split boundaries")
			}
			wantStart, wantEnd, amount := "B", "C", 818*months
			if mode == "cheapest" {
				wantStart, wantEnd, amount = "A", "D", 618*months
			}
			if segment.Fare.DepartureStation != wantStart || segment.Fare.ArrivalStation != wantEnd || segment.Fare.Fare != amount || result.Results[0].TotalFare != amount || result.Normal.Fare != amount {
				t.Fatalf("months=%d mode=%s result=%+v segment=%+v", months, mode, result, segment)
			}
		}
	}
	for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
		candidates, candidateErr := calculator.SplitCandidates([]string{"A", "X", "D"}, mode)
		wantCandidates := []string{"X"}
		if mode == "cheapest" {
			wantCandidates = []string{"B", "C"}
		}
		if candidateErr != nil || !reflect.DeepEqual(candidates, wantCandidates) {
			t.Fatalf("candidates %s: %v %v", mode, candidates, candidateErr)
		}
		extendedCandidates, candidateErr := calculator.SplitCandidates([]string{"B", "C"}, mode)
		if candidateErr != nil || len(extendedCandidates) != 0 {
			t.Fatalf("extended candidates: %v %v", extendedCandidates, candidateErr)
		}
		result, err := calculator.Calculate([]int{a, x, d}, 1, mode)
		if err != nil {
			t.Fatal(err)
		}
		want := []string{"A", "B", "C", "D"}
		if mode == "uncorrect" {
			want = []string{"A", "X", "D"}
		}
		if !reflect.DeepEqual(result.CorrectedPath, want) {
			t.Fatalf("mode=%s path=%v", mode, result.CorrectedPath)
		}
	}
	corrected := calculator.CorrectPath([]int{d, x, a})
	if !reflect.DeepEqual(corrected, []int{d, c, b, a}) {
		t.Fatalf("reverse correction=%v", corrected)
	}
}

func TestRoutePassResolvePathRejectsOversizedRoutes(t *testing.T) {
	g := graph.NewGraph(3000)
	names := make([]string, 3000)
	for i := range names {
		name := fmt.Sprintf("駅%d", i)
		names[i] = name
		g.GetOrAddID(name)
	}
	calculator := NewRoutePassCalculator(g, nil, nil)
	if _, err := calculator.ResolvePath(names); err != domain.ErrInvalidPath {
		t.Fatalf("ResolvePath error = %v, want %v", err, domain.ErrInvalidPath)
	}
}

func TestRoutePassCheapestRejectsLoopedExtensionCandidate(t *testing.T) {
	g := graph.NewGraph(4)
	a, b, c, x := g.GetOrAddID("A"), g.GetOrAddID("B"), g.GetOrAddID("C"), g.GetOrAddID("X")
	rules := []passdomain.ResolvedBypassRule{{ShortcutPath: []int{a, b, c}, DetourPath: []int{a, x, c}}}
	evaluator := routePassEvaluationFunc(func(path []int, _ int) (*CalculationResult, error) {
		amount := 10
		if reflect.DeepEqual(path, []int{a, b, c}) {
			amount = 20
		}
		if domain.HasDuplicateStation(path) {
			amount = 1
		}
		return &CalculationResult{Fare: amount}, nil
	})
	calculator := NewRoutePassCalculator(g, evaluator, rules)
	result, err := calculator.Calculate([]int{b, c}, 1, "cheapest")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(result.CorrectedPath, []string{"B", "C"}) || result.Fare != 10 {
		t.Fatalf("looped candidate was selected: %+v", result)
	}
}
