package pass_test

import (
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/usecase"
	"fmt"
	"math"
	"reflect"
	"sort"
	"testing"
)

func TestRoutePassSplitAgainstEnumeration(t *testing.T) {
	calc, g := setup(t)
	rules, err := passdomain.NewDefaultBypassRegistry().ResolveIDs(g.GetID)
	if err != nil {
		t.Fatal(err)
	}
	calculator := usecase.NewRoutePassCalculator(g, calc, rules)
	for _, names := range [][]string{{"新茂原", "茂原"}, {"日暮里", "尾久", "赤羽"}, {"博多", "博多南"}, {"南千歳", "新千歳空港"}} {
		for _, months := range []int{1, 3, 6} {
			for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
				t.Run(fmt.Sprintf("%s/%d/%s", names[0], months, mode), func(t *testing.T) {
					path, err := calculator.ResolvePath(names)
					if err != nil {
						t.Fatal(err)
					}
					baseline, err := calculator.Calculate(path, months, mode)
					if err != nil {
						t.Fatal(err)
					}
					got, err := calculator.Split(names, months, mode)
					if err != nil {
						t.Fatal(err)
					}
					if got.Normal.Fare != baseline.Fare+baseline.BarrierFreeFee+baseline.Charge {
						t.Fatal("baseline does not include all fees")
					}
					if mode == "cheapest" {
						path = calculator.CorrectPath(path)
					}
					minimum := math.MaxInt
					var expected []string
					for mask := 0; mask < 1<<(len(path)-2); mask++ {
						sum, prev := 0, 0
						cuts := []int{0}
						valid := true
						for j := 1; j < len(path); j++ {
							if j == len(path)-1 || mask&(1<<(j-1)) != 0 {
								fare, err := calculator.Calculate(path[prev:j+1], months, mode)
								if err != nil {
									valid = false
									break
								}
								sum += fare.Fare + fare.BarrierFreeFee + fare.Charge
								cuts = append(cuts, j)
								prev = j
							}
						}
						if !valid {
							continue
						}
						if sum < minimum {
							minimum = sum
							expected = nil
						}
						if sum == minimum {
							expected = append(expected, fmt.Sprint(cuts))
						}
					}
					indexes := map[string]int{}
					for i, id := range path {
						indexes[g.GetName(id)] = i
					}
					var actual []string
					for _, plan := range got.Results {
						if plan.TotalFare != minimum {
							t.Fatalf("total %d != %d", plan.TotalFare, minimum)
						}
						cuts := []int{0}
						previous := 0
						for _, seg := range plan.Segments {
							start, ok1 := indexes[seg.DepartureStation]
							end, ok2 := indexes[seg.ArrivalStation]
							if !ok1 || !ok2 || start != previous || end <= start {
								t.Fatalf("bad boundaries: %+v", seg)
							}
							fare, err := calculator.Calculate(path[start:end+1], months, mode)
							if err != nil {
								t.Fatal(err)
							}
							if seg.Fare.Fare != fare.Fare+fare.BarrierFreeFee+fare.Charge || !reflect.DeepEqual(seg.Fare.PrintedViaLines, fare.PrintedViaLines) {
								t.Fatal("ticket calculation differs")
							}
							cuts = append(cuts, end)
							previous = end
						}
						if previous != len(path)-1 {
							t.Fatal("incomplete route")
						}
						actual = append(actual, fmt.Sprint(cuts))
					}
					sort.Strings(expected)
					sort.Strings(actual)
					if !reflect.DeepEqual(expected, actual) {
						t.Fatalf("patterns=%v want=%v", actual, expected)
					}
				})
			}
		}
	}
}
