package split

import (
	"calculation-engine/internal/domain"
	"errors"
	"fmt"
	"reflect"
	"testing"
	"time"
)

func TestProgressCountsSkippedAndCachedCandidates(t *testing.T) {
	for _, limit := range []int{0, 1, 10} {
		t.Run(fmt.Sprintf("limit_%d", limit), func(t *testing.T) {
			var events []Progress
			calls := map[[2]int]int{}
			evaluate := func(i, j int) (RouteSplitSegment, error) {
				calls[[2]int{i, j}]++
				// 駅1では分割禁止。そこからの遷移は到達不能として省略される。
				if i == 1 || j == 1 {
					return RouteSplitSegment{}, domain.ErrInvalidPath
				}
				return RouteSplitSegment{Fare: RouteFare{Fare: j - i}}, nil
			}
			got, err := OptimizeFixedRouteWithProgress(4, evaluate, func(p Progress) { events = append(events, p) }, limit)
			if err != nil {
				t.Fatal(err)
			}
			for key, count := range calls {
				if count != 1 {
					t.Fatalf("evaluation repeated: %v: %d", key, count)
				}
			}
			want, err := OptimizeFixedRoute(4, evaluate, limit)
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("result changed: %v", err)
			}
			total := 6
			if limit > 0 {
				total *= min(limit+1, 3)
			}
			expected := []Progress{{"calculating", 0, total}, {"calculating", total, total}, {"organizing", total, total}}
			if !reflect.DeepEqual(events, expected) {
				t.Fatalf("events: %+v", events)
			}
		})
	}
}

func TestProgressDoesNotCompleteOnEvaluationError(t *testing.T) {
	failure := errors.New("evaluation failed")
	for _, limit := range []int{0, 1} {
		var events []Progress
		_, err := OptimizeFixedRouteWithProgress(4, func(i, j int) (RouteSplitSegment, error) {
			if j == 1 {
				time.Sleep(110 * time.Millisecond)
				return RouteSplitSegment{Fare: RouteFare{Fare: 1}}, nil
			}
			return RouteSplitSegment{}, failure
		}, func(p Progress) { events = append(events, p) }, limit)
		if !errors.Is(err, failure) || len(events) != 2 || events[0].Completed != 0 || events[1].Completed != 1 || events[1].Phase != "calculating" {
			t.Fatalf("err=%v events=%+v", err, events)
		}
	}
}

func TestProgressReportsCompletedWorkDuringCalculation(t *testing.T) {
	var events []Progress
	_, err := OptimizeFixedRouteWithProgress(3, func(i, j int) (RouteSplitSegment, error) {
		if j == 1 {
			time.Sleep(110 * time.Millisecond)
		}
		return RouteSplitSegment{Fare: RouteFare{Fare: 1}}, nil
	}, func(p Progress) { events = append(events, p) })
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 4 || events[1] != (Progress{"calculating", 1, 3}) {
		t.Fatalf("events=%+v", events)
	}
}
