package ticket_test

import (
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"reflect"
	"testing"
)

func TestRouteSplitRealRoutesAndModes(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	corrector := usecase.NewPipelineCorrector(
		usecase.NewSuburbanAreaCorrector(func(p []int) (int, error) {
			r, _, err := evaluator.ExecuteWithMode(p, 0, "normal")
			if err != nil {
				return 0, err
			}
			return r.TotalAmount(), nil
		}),
		usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector(),
	)
	calculator := usecase.NewRouteTicketCalculator(g, corrector, evaluator, nil, zones)
	cases := []struct {
		name, line string
		stations   []string
	}{
		{"隣接", "ソトボ", []string{"新茂原", "茂原"}},
		{"近郊迂回", "ヤマテ", []string{"東京", "神田", "秋葉原", "御徒町", "上野", "鶯谷", "日暮里", "西日暮里", "田端", "駒込", "巣鴨", "大塚", "池袋", "目白", "高田馬場", "新大久保", "新宿"}},
		{"新幹線都市区内", "シンカ", []string{"東京", "品川", "新横浜", "小田原", "熱海", "三島", "（東）新富士", "静岡", "掛川", "浜松", "豊橋", "三河安城", "名古屋"}},
		{"他社線", "イセ", []string{"河原田", "津"}},
	}
	for _, tc := range cases {
		for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
			t.Run(tc.name+"/"+mode, func(t *testing.T) {
				steps := make([]usecase.ViaStep, len(tc.stations))
				for i, name := range tc.stations {
					steps[i] = usecase.ViaStep{StationName: name}
					if i+1 < len(steps) {
						steps[i].LineName = tc.line
					}
				}
				path, err := calculator.ResolvePath(steps)
				if err != nil {
					t.Fatal(err)
				}
				baseline, _, err := calculator.Calculate(path, steps, mode)
				if err != nil {
					t.Fatal(err)
				}
				got, err := calculator.Split(steps, mode)
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(got.Normal, baseline) {
					t.Fatal("fare-page baseline differs")
				}
				target := path
				if mode == "cheapest" {
					target, err = calculator.PrepareSplitPath(steps, mode)
					if err != nil {
						t.Fatal(err)
					}
				}
				t.Logf("最安パターン数: %d", len(got.Results))
				if len(got.Results) == 0 {
					t.Fatal("no plans")
				}
				positions := map[string]int{}
				for i, id := range target {
					positions[g.GetName(id)] = i
				}
				for _, plan := range got.Results {
					total := 0
					last := 0
					for _, segment := range plan.Segments {
						i, ok1 := positions[segment.DepartureStation]
						j, ok2 := positions[segment.ArrivalStation]
						if !ok1 || !ok2 || i != last || j <= i {
							t.Fatalf("invalid boundaries: %+v", segment)
						}
						var via []usecase.ViaStep
						if mode != "cheapest" {
							via = append([]usecase.ViaStep(nil), steps[i:j+1]...)
							via[len(via)-1].LineName = ""
						}
						want, _, err := calculator.Calculate(target[i:j+1], via, mode)
						if err != nil || !reflect.DeepEqual(want, segment.Fare) {
							t.Fatalf("segment mode differs: %+v %+v %v", want, segment.Fare, err)
						}
						total += segment.Fare.Fare
						last = j
					}
					if last != len(target)-1 || total != plan.TotalFare || total != got.Results[0].TotalFare {
						t.Fatal("invalid total or incomplete route")
					}
				}
			})
		}
	}
}
