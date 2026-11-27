package ticket_test

import (
	"calculation-engine/internal/split"
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

func TestConnectingTicketZoneAndVia(t *testing.T) {
	calculator, _ := setupPricedRoute(t)
	stations := []string{"新潟", "燕三条", "長岡", "浦佐", "越後湯沢", "上毛高原", "高崎", "本庄早稲田", "熊谷", "大宮", "上野", "東京", "神田", "御茶ノ水", "水道橋", "飯田橋", "市ケ谷", "四ツ谷", "信濃町", "千駄ケ谷", "代々木", "新宿", "（中）大久保", "東中野", "中野", "西船橋"}
	tokyo := slices.Index(stations, "東京")
	steps := make([]usecase.ViaStep, len(stations))
	for i, name := range stations {
		steps[i].StationName = name
		if i+1 == len(stations) {
			break
		}
		switch {
		case i < tokyo:
			steps[i].LineName = "シヨシ"
		case name == "中野":
			steps[i].LineName = "メトロ東西"
		default:
			steps[i].LineName = "チユト"
		}
	}
	price := func(t *testing.T, steps []usecase.ViaStep, mode string) usecase.PricedRouteTicketFare {
		t.Helper()
		path, err := calculator.ResolvePath(steps)
		if err != nil {
			t.Fatal(err)
		}
		f, err := calculator.CalculateWithPricing(path, steps, mode, usecase.TicketPricingOptions{})
		if err != nil {
			t.Fatal(err)
		}
		return f
	}
	for _, mode := range []string{"normal", "uncorrect", "cheapest"} {
		t.Run(mode, func(t *testing.T) {
			jr := price(t, steps[:len(steps)-1], mode)
			f := price(t, steps, mode)
			wantVia := []string{"新潟", "新幹線", "中野"}
			if mode == "cheapest" {
				wantVia = append(slices.Clone(jr.PrintedViaLines), "中野")
			}
			if jr.ArrivalStation != "東京都区内" || f.Fare != jr.Fare+330 || f.DepartureStation != "新潟" || f.ArrivalStation != "西船橋" || !slices.Equal(f.PrintedViaLines, wantVia) {
				t.Fatalf("連絡券=%+v、JR単独=%+v", f, jr)
			}
		})
	}
	reverse := make([]usecase.ViaStep, len(steps))
	for i := range reverse {
		j := len(steps) - 1 - i
		reverse[i].StationName = steps[j].StationName
		if j > 0 {
			reverse[i].LineName = steps[j-1].LineName
		}
	}
	back := price(t, reverse, "normal")
	wantReverseVia := []string{"中野", "新幹線", "新潟"}
	if back.Fare != 6270 || back.DepartureStation != "西船橋" || back.ArrivalStation != "新潟" || !slices.Equal(back.PrintedViaLines, wantReverseVia) {
		t.Fatalf("逆方向=%+v", back)
	}
	short := steps[slices.Index(stations, "越後湯沢"):]
	jr := price(t, short[:len(short)-1], "normal")
	f := price(t, short, "normal")
	if jr.ArrivalStation != "中野" || f.TotalEigyoKilo <= 2000 || f.Fare != jr.Fare+330 || !slices.Contains(f.PrintedViaLines, "中央東") {
		t.Fatalf("200km境界の連絡券=%+v、JR単独=%+v", f, jr)
	}
	// 西船橋からJRで船橋まで乗る通過連絡券を、西船橋で分割すると最初の券は連絡券になる。
	through := slices.Clone(steps)
	through[len(through)-1].LineName = "ソウフ"
	through = append(through, usecase.ViaStep{StationName: "船橋"})
	plans, err := calculator.Split(through, "normal", split.RouteSplitOptions{MaxSplits: 1, NoSplitStations: stations[1 : len(stations)-1]})
	if err != nil {
		t.Fatal(err)
	}
	for _, plan := range plans.Results {
		if len(plan.Segments) == 2 {
			first := plan.Segments[0].Fare
			if first.ArrivalStation == "西船橋" && first.Fare == 6270 && slices.Equal(first.PrintedViaLines, []string{"新潟", "新幹線", "中野"}) {
				return
			}
		}
	}
	t.Fatalf("西船橋での分割結果=%+v", plans)
}
