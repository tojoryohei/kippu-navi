package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"errors"
	"slices"
	"testing"
)

func TestValidateTicketInputAfterOverlapDeduction(t *testing.T) {
	g := graph.NewGraph(10)
	c := NewRouteTicketCalculator(g, nil, nil, nil, nil)
	for _, tc := range []struct {
		name      string
		stations  []string
		duplicate bool
	}{
		{"deductible", []string{"御茶ノ水", "神田", "東京", "神田", "秋葉原"}, false},
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
