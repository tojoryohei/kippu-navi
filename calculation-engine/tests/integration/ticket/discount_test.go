package ticket_test

import (
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"reflect"
	"slices"
	"testing"
)

func setupPricedRoute(t testing.TB) (*usecase.RouteTicketCalculator, graph.Graph) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	corrector := usecase.NewPipelineCorrector(usecase.NewSuburbanAreaCorrector(nil), usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector())
	return usecase.NewRouteTicketCalculator(g, corrector, evaluator, nil, zones), g
}

func TestPricedRealRoutes(t *testing.T) {
	calculator, g := setupPricedRoute(t)
	for _, tc := range []struct {
		name                string
		stations            []string
		passenger, discount string
		want                int
		applied             bool
	}{
		{"連絡特定運賃の小児", []string{"津幡", "倶利伽羅", "高岡"}, "child", "none", 320, false},
		{"通常連絡運賃の小児", []string{"金沢", "津幡", "倶利伽羅", "高岡"}, "child", "none", 430, false},
		{"私鉄に割引しない", []string{"津幡", "倶利伽羅", "高岡"}, "adult", "west50", 640, false},
		{"実際の在来線を含む他社判定", []string{"名古屋", "岐阜羽島", "米原", "京都", "山科", "大津京"}, "adult", "central20", -1, false},
		{"大阪市内の他社判定", []string{"東京", "品川", "新横浜", "小田原", "熱海", "三島", "（東）新富士", "静岡", "掛川", "浜松", "豊橋", "三河安城", "名古屋", "岐阜羽島", "米原", "京都", "新大阪"}, "adult", "central20", -1, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			steps := make([]usecase.ViaStep, len(tc.stations))
			path := make([]int, len(tc.stations))
			for i, name := range tc.stations {
				steps[i].StationName = name
				path[i], _ = g.GetID(name)
			}
			got, err := calculator.CalculateWithPricing(path, steps, "normal", usecase.TicketPricingOptions{PassengerType: tc.passenger, DiscountID: tc.discount})
			if err != nil {
				t.Fatal(err)
			}
			if got.DiscountApplied != tc.applied || tc.want >= 0 && got.Fare != tc.want {
				t.Fatalf("%+v want=%d", got, tc.want)
			}
			if tc.want < 0 {
				base, _, err := calculator.Calculate(path, steps, "normal")
				if err != nil || base.Fare != got.Fare {
					t.Fatalf("基準=%+v、結果=%+v、エラー=%v", base, got, err)
				}
			}
		})
	}
}

// 折り返しのない通常券は新幹線エッジを保持し、その会社で割引を判定する。
func TestShinkansenDiscountCompanies(t *testing.T) {
	calculator, g := setupPricedRoute(t)
	for _, reverse := range []bool{false, true} {
		stations := []string{"名古屋", "岐阜羽島", "米原", "京都", "新大阪"}
		if reverse {
			slices.Reverse(stations)
		}
		path := make([]int, len(stations))
		steps := make([]usecase.ViaStep, len(stations))
		for i, name := range stations {
			path[i], _ = g.GetID(name)
			steps[i] = usecase.ViaStep{StationName: name, LineName: "シンカ"}
		}
		for _, mode := range []string{"normal", "uncorrect", "cheapest"} {
			base, result, err := calculator.Calculate(path, steps, mode)
			if err != nil {
				t.Fatal(err)
			}
			if mode != "cheapest" && !slices.Equal(result.FinalPath, path) {
				t.Fatalf("新幹線が不要に展開された: %v", result.FinalPath)
			}
			for _, discount := range []struct {
				id      string
				percent int
			}{{"central10", 90}, {"central20", 80}} {
				got, err := calculator.CalculateWithPricing(path, steps, mode, usecase.TicketPricingOptions{PassengerType: "adult", DiscountID: discount.id})
				if err != nil {
					t.Fatal(err)
				}
				want := base.Fare
				applied := mode != "cheapest"
				if applied {
					want = base.Fare * discount.percent / 1000 * 10
				}
				if got.DiscountApplied != applied || got.Fare != want {
					t.Fatalf("逆方向=%v、モード=%s、割引=%s: 結果=%+v、基準=%+v、会社=%v", reverse, mode, discount.id, got, base, result.JRCompanies)
				}
				unchanged := got.RouteTicketFare
				unchanged.Fare = base.Fare
				if !reflect.DeepEqual(unchanged, base) {
					t.Fatalf("券面が変化: %+v / %+v", unchanged, base)
				}
			}
		}
	}
}
