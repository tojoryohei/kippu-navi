package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"errors"
	"slices"
	"testing"
)

func TestValidateTicketInputBeforeOverlapDeduction(t *testing.T) {
	g := graph.NewGraph(10)
	c := NewRouteTicketCalculator(g, nil, nil, nil, nil)
	for _, tc := range []struct {
		name      string
		stations  []string
		duplicate bool
	}{
		{"turnaround between branches", []string{"御茶ノ水", "神田", "東京", "神田", "秋葉原"}, true},
		{"destination at branch", []string{"御茶ノ水", "神田", "東京", "神田"}, true},
		{"same outside stations", []string{"御茶ノ水", "神田", "東京", "神田", "御茶ノ水"}, true},
		{"ring", []string{"A", "B", "C", "A"}, false},
		{"six shaped", []string{"A", "B", "C", "D", "B"}, false},
		{"ordinary overlap", []string{"A", "B", "C", "B", "D"}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := make([]int, len(tc.stations))
			steps := make([]ViaStep, len(path))
			for i, name := range tc.stations {
				path[i] = g.GetOrAddID(name)
				steps[i].StationName = name
			}
			before := slices.Clone(path)
			err := c.validateInputPath(path)
			if errors.Is(err, domain.ErrDuplicateRoute) != tc.duplicate || err != nil && !tc.duplicate {
				t.Fatalf("検証結果 = %v, 重複 = %v", err, tc.duplicate)
			}
			if !slices.Equal(path, before) {
				t.Fatal("検証処理が入力を変更しています")
			}
			resolved, err := c.ResolvePath(steps)
			if errors.Is(err, domain.ErrDuplicateRoute) != tc.duplicate {
				t.Fatalf("ResolvePathのエラー = %v", err)
			}
			if !tc.duplicate && !slices.Equal(resolved, before) {
				t.Fatal("ResolvePathが計算用の経路を変更しています")
			}
		})
	}
}

func TestPrivateInteriorInTicketRoute(t *testing.T) {
	g := graph.NewGraph(8)
	addFareExtensionEdge(g, "A", "B", 10, domain.JREast)
	addFareExtensionEdge(g, "B", "X", 10, domain.Other)
	addFareExtensionEdge(g, "X", "C", 10, domain.Other)
	addFareExtensionEdge(g, "X", "Y", 10, domain.Other)
	addFareExtensionEdge(g, "C", "D", 10, domain.JREast)
	addFareExtensionEdge(g, "D", "X", 10, domain.JREast)
	addFareExtensionEdge(g, "X", "E", 10, domain.JREast)
	addFareExtensionEdge(g, "D", "B", 10, domain.JREast)
	addFareExtensionEdge(g, "B", "E", 10, domain.JREast)

	c := NewRouteTicketCalculator(g, nil, nil, nil, nil)
	for _, tc := range []struct {
		name     string
		stations []string
		want     error
	}{
		{"私鉄の途中駅", []string{"A", "B", "X", "C", "D", "X", "E"}, nil},
		{"JRと私鉄の境界駅", []string{"A", "B", "X", "C", "D", "B", "E"}, domain.ErrDuplicateRoute},
		{"私鉄内の折り返し", []string{"A", "B", "X", "Y", "X", "C", "D"}, domain.ErrDuplicateRoute},
	} {
		t.Run(tc.name, func(t *testing.T) {
			steps := make([]ViaStep, len(tc.stations))
			for i, name := range tc.stations {
				steps[i].StationName = name
			}
			path, err := c.ResolvePath(steps)
			if !errors.Is(err, tc.want) {
				t.Fatalf("ResolvePath(%v) = %v、期待値 = %v", tc.stations, err, tc.want)
			}
			if err == nil {
				got, _, err := c.prepareConventionalSplit(steps, path)
				if err != nil || !slices.Equal(got, path) {
					t.Fatalf("prepareConventionalSplit(%v) = %v, %v", tc.stations, got, err)
				}
			}
		})
	}
}
