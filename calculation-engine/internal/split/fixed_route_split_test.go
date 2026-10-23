package split

import (
	"calculation-engine/internal/domain"
	"errors"
	"fmt"
	"math"
	"math/rand"
	"reflect"
	"sort"
	"testing"
)

func TestFixedRouteSplitMatchesExhaustiveEnumeration(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	for trial := 0; trial < 100; trial++ {
		n := 2 + rng.Intn(7)
		costs := make(map[[2]int]int)
		calls := make(map[[2]int]int)
		for i := 0; i < n; i++ {
			for j := i + 1; j < n; j++ {
				costs[[2]int{i, j}] = 1 + rng.Intn(8)
			}
		}
		// 最初のケースでは、分割なしを含むすべての分割パターンが同額になります。
		if trial == 0 {
			for key := range costs {
				costs[key] = key[1] - key[0]
			}
		}
		got, err := OptimizeFixedRoute(n, func(i, j int) (RouteSplitSegment, error) {
			calls[[2]int{i, j}]++
			return RouteSplitSegment{DepartureStation: fmt.Sprint(i), ArrivalStation: fmt.Sprint(j), Fare: RouteFare{Fare: costs[[2]int{i, j}]}}, nil
		})
		if err != nil {
			t.Fatal(err)
		}
		minimum := math.MaxInt
		var want []string
		for mask := 0; mask < 1<<(n-2); mask++ {
			cuts := []int{0}
			total := 0
			prev := 0
			for j := 1; j < n; j++ {
				if j == n-1 || mask&(1<<(j-1)) != 0 {
					total += costs[[2]int{prev, j}]
					prev = j
					cuts = append(cuts, j)
				}
			}
			if total < minimum {
				minimum = total
				want = nil
			}
			if total == minimum {
				want = append(want, fmt.Sprint(cuts))
			}
		}
		var actual []string
		for i, plan := range got {
			if plan.TotalFare != minimum {
				t.Fatalf("試行 %d: %d != %d", trial, plan.TotalFare, minimum)
			}
			if i > 0 && len(got[i-1].Segments) > len(plan.Segments) {
				t.Fatal("乗車券の枚数順に並んでいません")
			}
			cuts := []string{"0"}
			for _, seg := range plan.Segments {
				cuts = append(cuts, seg.ArrivalStation)
			}
			actual = append(actual, fmt.Sprint(cuts))
		}
		sort.Strings(want)
		sort.Strings(actual)
		if !reflect.DeepEqual(want, actual) {
			t.Fatalf("試行 %d: 実際 %v 期待値 %v", trial, actual, want)
		}
		for key, count := range calls {
			if count != 1 {
				t.Fatalf("区間%vが%d回評価されています", key, count)
			}
		}
	}
}

func TestFixedRouteSplitErrors(t *testing.T) {
	unexpected := errors.New("予期しない失敗")
	for _, problem := range []error{domain.ErrInvalidPath, unexpected} {
		got, err := OptimizeFixedRoute(3, func(i, j int) (RouteSplitSegment, error) {
			if i == 0 && j == 2 {
				return RouteSplitSegment{}, problem
			}
			return RouteSplitSegment{Fare: RouteFare{Fare: 100}}, nil
		})
		if problem == unexpected {
			if !errors.Is(err, unexpected) {
				t.Fatalf("予期しないエラーが呼び出し元に返されていません: %v", err)
			}
		} else if err != nil || len(got) != 1 || len(got[0].Segments) != 2 {
			t.Fatalf("有効な分割案が失われました: %v %v", got, err)
		}
	}
	_, err := OptimizeFixedRoute(2, func(i, j int) (RouteSplitSegment, error) { return RouteSplitSegment{}, domain.ErrInvalidPath })
	if !errors.Is(err, domain.ErrNoValidPattern) {
		t.Fatal(err)
	}
}

func TestLimitedFixedRouteSplitMatchesExhaustiveEnumeration(t *testing.T) {
	rng := rand.New(rand.NewSource(42))
	for limit := 1; limit <= 4; limit++ {
		for trial := 0; trial < 100; trial++ {
			n := 2 + rng.Intn(7)
			forbidden := 1 + rng.Intn(n-1)
			costs := make(map[[2]int]int)
			calls := make(map[[2]int]int)
			for i := 0; i < n; i++ {
				for j := i + 1; j < n; j++ {
					costs[[2]int{i, j}] = 1 + rng.Intn(8)
				}
			}
			// 最初のケースでは、分割なしを含むすべての分割パターンが同額になります。
			if trial == 0 {
				for key := range costs {
					costs[key] = key[1] - key[0]
				}
			}
			got, err := OptimizeFixedRoute(n, func(i, j int) (RouteSplitSegment, error) {
				calls[[2]int{i, j}]++
				if (i > 0 && i == forbidden) || (j < n-1 && j == forbidden) {
					return RouteSplitSegment{}, domain.ErrInvalidPath
				}
				return RouteSplitSegment{DepartureStation: fmt.Sprint(i), ArrivalStation: fmt.Sprint(j), Fare: RouteFare{Fare: costs[[2]int{i, j}]}}, nil
			}, limit)
			if err != nil {
				t.Fatal(err)
			}
			minimum := math.MaxInt
			var want []string
			for mask := 0; mask < 1<<(n-2); mask++ {
				if forbidden < n-1 && mask&(1<<(forbidden-1)) != 0 {
					continue
				}
				cuts := []int{0}
				total := 0
				prev := 0
				for j := 1; j < n; j++ {
					if j == n-1 || mask&(1<<(j-1)) != 0 {
						total += costs[[2]int{prev, j}]
						prev = j
						cuts = append(cuts, j)
					}
				}
				if len(cuts)-2 > limit {
					continue
				}
				if total < minimum {
					minimum = total
					want = nil
				}
				if total == minimum {
					want = append(want, fmt.Sprint(cuts))
				}
			}
			var actual []string
			for i, plan := range got {
				if plan.TotalFare != minimum {
					t.Fatalf("試行 %d: %d != %d", trial, plan.TotalFare, minimum)
				}
				if i > 0 && len(got[i-1].Segments) > len(plan.Segments) {
					t.Fatal("乗車券の枚数順に並んでいません")
				}
				cuts := []string{"0"}
				for _, seg := range plan.Segments {
					cuts = append(cuts, seg.ArrivalStation)
				}
				actual = append(actual, fmt.Sprint(cuts))
			}
			sort.Strings(want)
			sort.Strings(actual)
			if !reflect.DeepEqual(want, actual) {
				t.Fatalf("試行 %d: 実際 %v 期待値 %v", trial, actual, want)
			}
			for key, count := range calls {
				if count != 1 {
					t.Fatalf("区間%vが%d回評価されています", key, count)
				}
			}

		}
	}

}
