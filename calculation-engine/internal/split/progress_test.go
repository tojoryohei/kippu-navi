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
			now := time.Unix(0, 0)
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
			got, err := optimizeFixedRouteWithClock(4, evaluate, func(p Progress) { events = append(events, p) }, func() time.Time { return now }, limit)
			if err != nil {
				t.Fatal(err)
			}
			for key, count := range calls {
				if count != 1 {
					t.Fatalf("区間%vが%d回評価されています", key, count)
				}
			}
			want, err := OptimizeFixedRoute(4, evaluate, limit)
			if err != nil || !reflect.DeepEqual(got, want) {
				t.Fatalf("計算結果が変化しました: %v", err)
			}
			total := 6
			if limit > 0 {
				total *= min(limit+1, 3)
			}
			expected := []Progress{{"calculating", 0, total}, {"calculating", total, total}, {"organizing", total, total}}
			if !reflect.DeepEqual(events, expected) {
				t.Fatalf("進捗通知: %+v", events)
			}
		})
	}
}

func TestProgressDoesNotCompleteOnEvaluationError(t *testing.T) {
	failure := errors.New("評価に失敗しました")
	for _, limit := range []int{0, 1} {
		now := time.Unix(0, 0)
		var events []Progress
		_, err := optimizeFixedRouteWithClock(4, func(i, j int) (RouteSplitSegment, error) {
			if j == 1 {
				now = now.Add(110 * time.Millisecond)
				return RouteSplitSegment{Fare: RouteFare{Fare: 1}}, nil
			}
			return RouteSplitSegment{}, failure
		}, func(p Progress) { events = append(events, p) }, func() time.Time { return now }, limit)
		if !errors.Is(err, failure) || len(events) != 2 || events[0].Completed != 0 || events[1].Completed != 1 || events[1].Phase != "calculating" {
			t.Fatalf("エラー=%v 進捗通知=%+v", err, events)
		}
	}
}

func TestProgressReportsCompletedWorkDuringCalculation(t *testing.T) {
	now := time.Unix(0, 0)
	var events []Progress
	_, err := optimizeFixedRouteWithClock(3, func(i, j int) (RouteSplitSegment, error) {
		if j == 1 {
			now = now.Add(110 * time.Millisecond)
		}
		return RouteSplitSegment{Fare: RouteFare{Fare: 1}}, nil
	}, func(p Progress) { events = append(events, p) }, func() time.Time { return now })
	if err != nil {
		t.Fatal(err)
	}
	if len(events) != 4 || events[1] != (Progress{"calculating", 1, 3}) {
		t.Fatalf("進捗通知=%+v", events)
	}
}
