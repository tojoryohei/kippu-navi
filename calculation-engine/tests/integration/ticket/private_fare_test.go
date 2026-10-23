package ticket_test

import (
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"slices"
	"testing"
)

func TestPrivateCompanyFares(t *testing.T) {
	calc, g := setupTicketAmount(t)
	cases := []struct {
		stations []string
		fare     int
	}{
		{[]string{"青森", "野辺地", "八戸", "目時", "好摩", "盛岡"}, 6120},
		{[]string{"直江津", "上越妙高", "妙高高原", "豊野", "長野"}, 1920},
		{[]string{"津幡", "倶利伽羅", "高岡"}, 640},
		{[]string{"津幡", "倶利伽羅"}, 230},
		{[]string{"倶利伽羅", "高岡"}, 500},
		{[]string{"金沢", "津幡", "倶利伽羅", "高岡"}, 870},
		{[]string{"津幡", "倶利伽羅", "高岡", "富山"}, 1150},
		{[]string{"金沢", "津幡", "倶利伽羅", "高岡", "富山"}, 1290},
		{[]string{"福知山", "宮津", "豊岡"}, 1500},
		{[]string{"鶴橋", "伊勢中川", "松阪"}, 1880},
	}
	for _, tc := range cases {
		t.Run(tc.stations[0]+"―"+tc.stations[len(tc.stations)-1], func(t *testing.T) {
			path := make([]int, len(tc.stations))
			for i, n := range tc.stations {
				var ok bool
				path[i], ok = g.GetID(n)
				if !ok {
					t.Fatal(n)
				}
			}
			for range 2 {
				got, err := calc.Execute(path)
				if err != nil {
					t.Fatal(err)
				}
				if got.TotalAmount() != tc.fare {
					t.Errorf("運賃=%d、期待値=%d", got.TotalAmount(), tc.fare)
				}
				slices.Reverse(path)
			}
		})
	}
}

func TestPrivateCompanyRouteSplit(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	corrector := usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector())
	calculator := usecase.NewRouteTicketCalculator(g, corrector, evaluator, nil, zones)
	cases := []struct {
		steps        []usecase.ViaStep
		normal, best int
	}{
		{[]usecase.ViaStep{{StationName: "青森", LineName: "青い森鉄道"}, {StationName: "野辺地", LineName: "青い森鉄道"}, {StationName: "八戸", LineName: "青い森鉄道"}, {StationName: "目時", LineName: "いわて銀河"}, {StationName: "好摩", LineName: "いわて銀河"}, {StationName: "盛岡", LineName: ""}}, 6120, 5790},
		{[]usecase.ViaStep{{StationName: "津幡", LineName: "いしかわ"}, {StationName: "倶利伽羅", LineName: "とやま鉄道"}, {StationName: "高岡", LineName: ""}}, 640, 640},
		{[]usecase.ViaStep{{StationName: "津幡", LineName: "いしかわ"}, {StationName: "倶利伽羅", LineName: "とやま鉄道"}, {StationName: "高岡", LineName: "とやま鉄道"}, {StationName: "富山", LineName: ""}}, 1150, 1030},
	}
	for _, tc := range cases {
		// モード別の経路処理は元の不具合を再現する青森―盛岡で確認する。
		modes := []string{"normal"}
		if tc.steps[0].StationName == "青森" {
			modes = append(modes, "cheapest", "uncorrect")
		}
		for _, mode := range modes {
			t.Run(tc.steps[0].StationName+"/"+tc.steps[len(tc.steps)-1].StationName+"/"+mode, func(t *testing.T) {
				got, err := calculator.Split(tc.steps, mode)
				if err != nil {
					t.Fatal(err)
				}
				if got.Normal.Fare != tc.normal {
					t.Errorf("通常運賃=%d、期待値=%d", got.Normal.Fare, tc.normal)
				}
				if len(got.Results) == 0 {
					t.Fatal("分割案なし")
				}
				for _, plan := range got.Results {
					if plan.TotalFare != tc.best {
						t.Errorf("最安分割運賃=%d、期待値=%d", plan.TotalFare, tc.best)
					}
				}
			})
		}
	}
}
