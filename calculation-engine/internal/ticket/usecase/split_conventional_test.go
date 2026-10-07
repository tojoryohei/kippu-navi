package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"reflect"
	"slices"
	"testing"
)

func TestSplitOriginsFollowCorrectedStations(t *testing.T) {
	before := []int{1, 2, 3, 4, 5, 6, 7}
	origins := [][]int{nil, {0}, {0}, nil, {1}, {1}, nil}
	after := []int{1, 9, 4, 8, 7}
	got := propagateSplitOrigins(before, after, origins)
	if !reflect.DeepEqual(got[1], []int{0, 0}) || !reflect.DeepEqual(got[3], []int{1, 1}) {
		t.Fatalf("independent provenance lost: %v", got)
	}
	// 既存の駅が置換で再び現れた場合、その出現には置換元の区間情報を保持します。
	got = propagateSplitOrigins([]int{9, 1, 2, 3, 4}, []int{9, 1, 9, 4}, [][]int{nil, nil, {2}, {2}, nil})
	if len(got[0]) != 0 || !reflect.DeepEqual(got[2], []int{2, 2}) {
		t.Fatalf("repeated occurrence confused: %v", got)
	}
}

type splitTestCorrection func([]int, graph.Graph) ([]int, error)

func (f splitTestCorrection) Correct(p []int, g graph.Graph) ([]int, error) { return f(p, g) }

func TestSplitRollbackTracksNormalCorrection(t *testing.T) {
	g := graph.NewGraph(100)
	var rule splitConventionalRule
	for _, candidate := range splitConventionalRules {
		if candidate.Name == "東海道・山陽" {
			rule = candidate
		}
	}
	from, to := slices.Index(rule.Conventional, "名古屋"), slices.Index(rule.Conventional, "米原")
	for i := from; i < to; i++ {
		addFareExtensionEdge(g, rule.Conventional[i], rule.Conventional[i+1], 10, domain.JRCentral)
	}
	x := g.GetOrAddID("既存駅")
	g.GetOrAddID("岐阜羽島")
	gif, _ := g.GetID("岐阜")
	corrector := splitTestCorrection(func(path []int, _ graph.Graph) ([]int, error) {
		out := append([]int(nil), path...)
		for i, id := range out {
			if id == gif {
				out[i] = x
			}
		}
		return out, nil
	})
	calculator := NewRouteTicketCalculator(g, corrector, nil, nil, nil)
	steps := []ViaStep{{StationName: "既存駅"}, {StationName: "名古屋", LineName: "シンカ"}, {StationName: "岐阜羽島", LineName: "シンカ"}, {StationName: "米原"}}
	result, err := calculator.SplitCandidateDetails(steps, "cheapest")
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Replacements) != 1 || result.Replacements[0].Status != "retained_duplicate" {
		t.Fatalf("normal correction origin lost: %+v", result)
	}
	if !slices.Contains(result.Names, "岐阜羽島") {
		t.Fatal("original Shinkansen not restored")
	}
}

func TestSplitReplacementMissingDataIsError(t *testing.T) {
	g := graph.NewGraph(3)
	for _, name := range []string{"三島", "（東）新富士", "静岡"} {
		g.GetOrAddID(name)
	}
	_, err := replacementAt([]ViaStep{{StationName: "三島", LineName: "シンカ"}, {StationName: "（東）新富士", LineName: "シンカ"}, {StationName: "静岡"}}, 0, g)
	if err == nil {
		t.Fatal("missing conventional data silently ignored")
	}
}

func TestConventionalReplacementCollisionAndLoops(t *testing.T) {
	for _, tc := range []struct {
		name     string
		original []int
		blocks   []*splitReplacement
		want     []int
		disabled []bool
	}{
		{"複数置換の衝突と独立区間", []int{1, 2, 3, 4, 5, 6}, []*splitReplacement{{start: 0, end: 1, path: []int{1, 9, 2}}, {start: 2, end: 3, path: []int{3, 9, 4}}, {start: 4, end: 5, path: []int{5, 8, 6}}}, []int{1, 2, 3, 4, 5, 8, 6}, []bool{true, true, false}},
		{"環状", []int{1, 2, 3, 1}, []*splitReplacement{{start: 0, end: 1, path: []int{1, 8, 2}}}, []int{1, 8, 2, 3, 1}, []bool{false}},
		{"6の字", []int{1, 2, 3, 4, 2}, []*splitReplacement{{start: 0, end: 1, path: []int{1, 8, 2}}}, []int{1, 8, 2, 3, 4, 2}, []bool{false}},
		{"終端折返し", []int{1, 2, 3}, []*splitReplacement{{start: 0, end: 1, path: []int{1, 3, 2}}}, []int{1, 2, 3}, []bool{true}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			original := slices.Clone(tc.original)
			got, err := resolveConventionalReplacements(tc.original, tc.blocks, nil, nil)
			if err != nil || !slices.Equal(got, tc.want) {
				t.Fatalf("got %v, %v; want %v", got, err, tc.want)
			}
			if !slices.Equal(original, tc.original) {
				t.Fatal("入力経路が変更されました")
			}
			for i, block := range tc.blocks {
				if block.disabled != tc.disabled[i] {
					t.Fatalf("区間%dの取り消し = %v", i, block.disabled)
				}
			}
		})
	}
}
