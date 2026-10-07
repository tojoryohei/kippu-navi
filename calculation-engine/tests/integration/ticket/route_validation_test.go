package ticket_test

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/split"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"errors"
	"reflect"
	"slices"
	"testing"
)

func TestRouteTicketRejectsOverlapBeforeModeCorrection(t *testing.T) {
	_, g := setupTicketAmount(t)
	// 後段の補正で不正な重複が消える可能性があるため、先に検証します。
	// DPの区間評価など、ResolvePathを経由せずCalculateを呼ぶ場合も対象です。
	c := usecase.NewRouteTicketCalculator(g, usecase.NewSuburbanAreaCorrector(nil), nil, nil, nil)
	for _, names := range [][]string{
		{"三河安城", "名古屋", "尾頭橋", "（中）金山"},
		{"御茶ノ水", "神田", "東京", "神田"},
		{"新下関", "小倉", "門司"},
		{"幡生", "新下関", "小倉", "西小倉"},
		{"南小倉", "西小倉", "小倉", "博多", "吉塚"},
		{"西小倉", "小倉", "博多"},
		{"小倉", "博多", "吉塚"},
		{"黒崎", "八幡", "スペースワールド", "枝光", "戸畑", "九州工大前", "西小倉", "小倉", "博多"},
		{"小倉", "博多", "吉塚", "箱崎", "千早", "香椎"},
	} {
		for _, reverse := range []bool{false, true} {
			stations := slices.Clone(names)
			if reverse {
				slices.Reverse(stations)
			}
			path := make([]int, len(stations))
			steps := make([]usecase.ViaStep, len(stations))
			for i, name := range stations {
				id, ok := g.GetID(name)
				if !ok {
					t.Fatal(name)
				}
				path[i], steps[i].StationName = id, name
			}
			for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
				t.Run(stations[0]+"/"+mode, func(t *testing.T) {
					assertDuplicate := func(err error) {
						t.Helper()
						if !errors.Is(err, domain.ErrDuplicateRoute) {
							t.Fatalf("expected duplicate route, got %v", err)
						}
					}
					_, err := c.ResolvePath(steps)
					assertDuplicate(err)
					_, _, err = c.Calculate(path, steps, mode)
					assertDuplicate(err)
					_, err = c.Split(steps, mode)
					assertDuplicate(err)
					_, err = c.SplitCandidateDetails(steps, mode)
					assertDuplicate(err)
				})
			}
		}
	}
}

func TestRouteTicketKyushuValidationKeepsFareAndSplitRoutes(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	corrector := usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector())
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), nil, zones, g)
	c := usecase.NewRouteTicketCalculator(g, corrector, evaluator, nil, zones)
	for _, names := range [][]string{
		{"新下関", "小倉"},
		{"小倉", "博多"},
		{"新下関", "小倉", "博多"},
		{"南小倉", "西小倉", "小倉", "博多", "竹下"},
		{"小倉", "博多", "吉塚", "柚須"},
		{"南小倉", "西小倉", "小倉", "博多", "吉塚", "柚須"},
		{"新下関", "小倉", "博多", "吉塚", "柚須"},
	} {
		for _, reverse := range []bool{false, true} {
			stations := slices.Clone(names)
			if reverse {
				slices.Reverse(stations)
			}
			path := make([]int, len(stations))
			steps := make([]usecase.ViaStep, len(stations))
			for i, name := range stations {
				id, ok := g.GetID(name)
				if !ok {
					t.Fatal(name)
				}
				path[i], steps[i].StationName = id, name
			}
			for i := 0; i+1 < len(path); i++ {
				for _, edge := range g.GetEdges(path[i]) {
					if edge.ToID == path[i+1] {
						steps[i].LineName = edge.Line
						break
					}
				}
				if steps[i].LineName == "" {
					t.Fatalf("接続なし: %s→%s", stations[i], stations[i+1])
				}
			}
			for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
				t.Run(stations[0]+"/"+stations[len(stations)-1]+"/"+mode, func(t *testing.T) {
					resolved, err := c.ResolvePath(steps)
					if err != nil || !slices.Equal(resolved, path) {
						t.Fatalf("入力経路が変化: %v, %v", resolved, err)
					}
					fare, _, err := c.Calculate(path, steps, mode)
					if err != nil {
						t.Fatal(err)
					}
					got, err := c.Split(steps, mode, split.RouteSplitOptions{MaxSplits: 1})
					if err != nil || !reflect.DeepEqual(got.Normal, fare) {
						t.Fatalf("比較運賃が不一致: %v", err)
					}
					candidates, err := c.SplitCandidates(steps, mode)
					if err != nil {
						t.Fatal(err)
					}
					for _, station := range []string{"幡生", "下関", "門司", "黒崎", "折尾", "香椎"} {
						if slices.Contains(candidates, station) {
							t.Fatalf("検証用の駅が分割候補に混入: %s", station)
						}
					}
					if len(path) == 2 && (stations[0] == "新下関" || stations[1] == "新下関") {
						if fare.TotalEigyoKilo != 190 || !slices.Contains(fare.PrintedViaLines, "新幹線") {
							t.Fatalf("新幹線の運賃・印字経路が変化: %+v", fare)
						}
					}
					for _, plan := range got.Results {
						for _, segment := range plan.Segments {
							if segment.DepartureStation == "西小倉" && segment.ArrivalStation == "博多" || segment.DepartureStation == "博多" && segment.ArrivalStation == "西小倉" {
								t.Fatal("分割で特例条件を失った区間が採用された")
							}
						}
					}
				})
			}
		}
	}
}

func TestRouteTicketRejectsReturnToOrioAfterRule43_2(t *testing.T) {
	_, g := setupTicketAmount(t)
	c := usecase.NewRouteTicketCalculator(g, nil, nil, nil, nil)
	names := []string{
		"折尾", "東水巻", "中間", "筑前垣生", "鞍手", "筑前植木", "新入", "直方", "勝野", "小竹", "鯰田", "浦田", "新飯塚",
		"上三緒", "下鴨生", "筑前庄内", "船尾", "田川後藤寺", "田川伊田", "一本松", "香春", "採銅所", "呼野",
		"石原町", "志井", "志井公園", "石田", "城野", "南小倉", "西小倉", "小倉", "博多",
	}
	path := make([]int, len(names))
	steps := make([]usecase.ViaStep, len(names))
	for i, name := range names {
		id, ok := g.GetID(name)
		if !ok {
			t.Fatal(name)
		}
		path[i], steps[i].StationName = id, name
	}
	// 小倉での折り返しは特例で控除されても、展開後には折尾の再通過が残ります。
	for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
		t.Run(mode, func(t *testing.T) {
			_, resolveErr := c.ResolvePath(steps)
			_, _, fareErr := c.Calculate(path, steps, mode)
			_, splitErr := c.Split(steps, mode)
			_, candidateErr := c.SplitCandidateDetails(steps, mode)
			for _, err := range []error{resolveErr, fareErr, splitErr, candidateErr} {
				if !errors.Is(err, domain.ErrDuplicateRoute) {
					t.Fatalf("折尾の再通過を検出できていない: %v", err)
				}
			}
		})
	}
}

func TestRouteTicketDeductibleOverlapAndInvalidSplitIntervals(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), nil, zones, g)
	c := usecase.NewRouteTicketCalculator(g, usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector()), evaluator, nil, zones)
	steps := []usecase.ViaStep{{StationName: "御茶ノ水"}, {StationName: "神田"}, {StationName: "東京"}, {StationName: "神田"}, {StationName: "秋葉原"}}
	path, err := c.ResolvePath(steps)
	if err != nil {
		t.Fatal(err)
	}
	for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
		t.Run(mode, func(t *testing.T) {
			baseline, _, err := c.Calculate(path, steps, mode)
			if err != nil {
				t.Fatal(err)
			}
			if _, _, err := c.Calculate(path[1:4], nil, mode); !errors.Is(err, domain.ErrDuplicateRoute) {
				t.Fatalf("foldback interval should be invalid: %v", err)
			}
			result, err := c.Split(steps, mode)
			if err != nil {
				t.Fatal(err)
			}
			if result.Normal.Fare != baseline.Fare || len(result.Results) == 0 {
				t.Fatal("missing valid split result")
			}
			for _, plan := range result.Results {
				for _, segment := range plan.Segments {
					if segment.DepartureStation == "神田" && segment.ArrivalStation == "神田" {
						t.Fatal("invalid foldback interval included")
					}
				}
			}
		})
	}
}
