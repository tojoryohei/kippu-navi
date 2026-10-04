package ticket_test

import (
	"reflect"
	"slices"
	"testing"

	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
)

func TestFareViaWithAppliedCityZone(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(
		calc, usecase.NewSpecialZoneApplier(g, zones),
		usecase.NewPostZoneCleanupCorrector(), zones, g,
	)
	tests := []struct {
		name         string
		stations     []string
		ordinaryEnds int
		want         []string
	}{
		{
			name: "東京都区内の在来線印字を省く",
			stations: []string{
				"東京", "有楽町", "新橋", "浜松町", "田町", "高輪ゲートウェイ", "品川",
				"新横浜", "小田原", "熱海", "三島", "（東）新富士",
				"静岡", "掛川", "浜松", "豊橋", "三河安城", "名古屋",
			},
			ordinaryEnds: 6,
			want:         []string{"新幹線", "名古屋"},
		},
		{
			name: "東京都区内の品川を省いて市外の新幹線駅を残す",
			stations: []string{
				"東京", "品川", "新横浜", "小田原", "熱海", "三島", "（東）新富士",
				"静岡", "掛川", "浜松", "豊橋", "三河安城", "名古屋",
			},
			want: []string{"新幹線", "名古屋"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := make([]int, len(tt.stations))
			viaSteps := make([]usecase.ViaStep, len(tt.stations))
			for i, name := range tt.stations {
				var ok bool
				path[i], ok = g.GetID(name)
				if !ok {
					t.Fatalf("station %s not found", name)
				}
				viaSteps[i].StationName = name
				if i < len(tt.stations)-1 {
					viaSteps[i].LineName = "シンカ"
					if i < tt.ordinaryEnds {
						viaSteps[i].LineName = "トウカ"
					}
				}
			}
			result, _, err := evaluator.ExecuteWithMode(path, 0, "normal")
			if err != nil {
				t.Fatal(err)
			}
			finalNames := make([]string, len(result.FinalPath))
			for i, id := range result.FinalPath {
				finalNames[i] = g.GetName(id)
			}
			if finalNames[0] != "東京都区内" {
				t.Fatalf("city zone not applied: %v", finalNames)
			}
			if tt.ordinaryEnds > 0 && !slices.Contains(usecase.GetFareVia(viaSteps), "東海道") {
				t.Fatalf("input route must print 東海道 before zone filtering: %v", usecase.GetFareVia(viaSteps))
			}
			got := usecase.GetFareViaForResult(viaSteps, result.FinalPath, g, zones)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("finalPath=%v, rawVia=%v, filteredVia=%v, want=%v",
					finalNames, usecase.GetFareVia(viaSteps), got, tt.want)
			}
		})
	}
}

func TestFareViaOsakaShinOsakaToOkayama(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(
		calc, usecase.NewSpecialZoneApplier(g, zones),
		usecase.NewPostZoneCleanupCorrector(), zones, g,
	)
	names := []string{"大阪", "新大阪", "新神戸", "西明石", "姫路", "相生", "岡山"}
	path := make([]int, len(names))
	steps := make([]usecase.ViaStep, len(names))
	for i, name := range names {
		id, ok := g.GetID(name)
		if !ok {
			t.Fatalf("station %q is missing", name)
		}
		path[i] = id
		steps[i].StationName = name
		if i == 0 {
			steps[i].LineName = "トウカ"
		} else if i < len(names)-1 {
			steps[i].LineName = "シンカ"
		}
	}
	result, _, err := evaluator.ExecuteWithMode(path, 0, "normal")
	if err != nil {
		t.Fatal(err)
	}
	if got := g.GetName(result.FinalPath[0]); got != "大阪・新大阪" {
		t.Fatalf("final departure = %q, want 大阪・新大阪", got)
	}
	want := []string{"東海道", "山陽", "西明石", "新幹線", "岡山"}
	if got := usecase.GetFareViaForResultWithSections(steps, result.FinalPath, g, zones); !reflect.DeepEqual(got, want) {
		t.Fatalf("fare via = %v, want %v", got, want)
	}
}

func TestFareViaWithShinkansenOverlap(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(
		calc, usecase.NewSpecialZoneApplier(g, zones),
		usecase.NewPostZoneCleanupCorrector(), zones, g,
	)
	shinkansen := []string{"東京", "品川", "新横浜", "小田原", "熱海", "三島", "（東）新富士", "静岡", "掛川", "浜松", "豊橋", "三河安城", "名古屋"}
	toKanayama := []string{"尾頭橋", "（中）金山"}
	central := []string{"鶴舞", "千種", "大曽根", "新守山", "勝川", "春日井", "神領", "高蔵寺", "定光寺", "古虎渓", "多治見", "土岐市", "瑞浪", "釜戸", "武並", "恵那", "美乃坂本", "中津川"}
	for _, tt := range []struct {
		name    string
		mode    string
		end     string
		wantVia []string
	}{
		{"中津川・通常", "normal", "中津川", []string{"新幹線", "中央西"}},
		{"中津川・補正禁止", "uncorrect", "中津川", []string{"新幹線", "中央西"}},
		{"大曽根・通常", "normal", "大曽根", []string{"新幹線", "名古屋"}},
		{"大曽根・補正禁止", "uncorrect", "大曽根", []string{"新幹線", "名古屋"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			stations := append(append([]string{}, shinkansen...), toKanayama...)
			for _, name := range central {
				stations = append(stations, name)
				if name == tt.end {
					break
				}
			}
			path := make([]int, len(stations))
			viaSteps := make([]usecase.ViaStep, len(stations))
			for i, name := range stations {
				var ok bool
				path[i], ok = g.GetID(name)
				if !ok {
					t.Fatalf("station %s not found", name)
				}
				viaSteps[i].StationName = name
				if i < len(shinkansen)-1 {
					viaSteps[i].LineName = "シンカ"
				} else if i < len(shinkansen)+len(toKanayama)-1 {
					viaSteps[i].LineName = "トウカ"
				} else if i < len(stations)-1 {
					viaSteps[i].LineName = "チユサ"
				}
			}
			corrected, err := usecase.CorrectPathForMode(path, g, usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector()), tt.mode)
			if err != nil {
				t.Fatal(err)
			}
			result, _, err := evaluator.ExecuteWithMode(corrected, 0, tt.mode)
			if err != nil {
				t.Fatal(err)
			}
			got := usecase.GetFareViaForResult(viaSteps, result.FinalPath, g, zones)
			if !reflect.DeepEqual(got, tt.wantVia) {
				finalNames := make([]string, len(result.FinalPath))
				for i, id := range result.FinalPath {
					finalNames[i] = g.GetName(id)
				}
				t.Fatalf("finalPath=%v, via=%v, want=%v", finalNames, got, tt.wantVia)
			}
		})
	}
}

func TestArticle88ShinkansenCorrectionRespectsMode(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	for _, reverse := range []bool{false, true} {
		for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
			names := []string{"新大阪", "新神戸", "西明石", "姫路"}
			want := []string{"大阪・新大阪", "大阪", "塚本", "尼崎", "立花", "甲子園口", "西宮", "さくら夙川", "芦屋", "甲南山手", "摂津本山", "（東）住吉", "六甲道", "摩耶", "灘", "三ノ宮", "元町", "神戸", "兵庫", "新長田", "鷹取", "須磨海浜公園", "須磨", "塩屋", "垂水", "舞子", "朝霧", "明石", "西明石", "姫路"}
			wantKilo := 879
			if mode == "uncorrect" {
				want = []string{"大阪・新大阪", "新大阪", "新神戸", "西明石", "姫路"}
				wantKilo = 955
			}
			want = append(want[:len(want)-1], "（陽）大久保", "魚住", "土山", "東加古川", "加古川", "宝殿", "曽根", "ひめじ別所", "御着", "東姫路", "姫路")
			if reverse {
				slices.Reverse(names)
				slices.Reverse(want)
			}
			path := make([]int, len(names))
			for i, name := range names {
				path[i], _ = g.GetID(name)
			}
			corrected, err := usecase.CorrectPathForMode(path, g, usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewRule157Corrector()), mode)
			if err != nil {
				t.Fatal(err)
			}
			result, transformed, err := evaluator.ExecuteWithMode(corrected, 0, mode)
			if err != nil {
				t.Fatal(err)
			}
			wantVia := []string{"東海道", "山陽", "西明石", "新幹線", "姫路"}
			if mode == "cheapest" {
				wantVia = []string{"東海道", "山陽"}
			}
			if mode == "uncorrect" {
				wantVia = []string{"新大阪", "新幹線", "姫路"}
			}
			steps := make([]usecase.ViaStep, len(names))
			for i, name := range names {
				steps[i].StationName = name
				if i+1 < len(names) {
					steps[i].LineName = "シンカ"
				}
			}
			if reverse {
				slices.Reverse(wantVia)
			}
			if via := usecase.GetCalculatedFareVia(mode, steps, path, transformed, result.FinalPath, g, zones); !slices.Equal(via, wantVia) {
				t.Fatalf("mode=%s reverse=%v via=%v want=%v", mode, reverse, via, wantVia)
			}
			got := make([]string, len(transformed))
			for i, id := range transformed {
				got[i] = g.GetName(id)
			}
			if !slices.Equal(got, want) || int(result.TotalEigyoKilo) != wantKilo {
				t.Fatalf("mode=%s reverse=%v path=%v distance=%v; want %v %d", mode, reverse, got, result.TotalEigyoKilo, want, wantKilo)
			}
		}
	}
}

func TestOsakaViaShinOsakaToHimeji(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	fareEval := func(p []int) (int, error) {
		r, _, e := evaluator.ExecuteWithMode(p, 0, "normal")
		if e != nil {
			return 0, e
		}
		return r.TotalAmount(), nil
	}
	corrector := usecase.NewPipelineCorrector(usecase.NewSuburbanAreaCorrector(fareEval), usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector())
	for _, reverse := range []bool{false, true} {
		for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
			names := []string{"大阪", "新大阪", "新神戸", "西明石", "（陽）大久保", "魚住", "土山", "東加古川", "加古川", "宝殿", "曽根", "ひめじ別所", "御着", "東姫路", "姫路"}
			lines := make([]string, len(names)-1)
			for i := range lines {
				lines[i] = "サンヨ"
			}
			lines[0] = "トウカ"
			lines[1] = "シンカ"
			lines[2] = "シンカ"
			if reverse {
				slices.Reverse(names)
				slices.Reverse(lines)
			}
			path := make([]int, len(names))
			steps := make([]usecase.ViaStep, len(names))
			for i, n := range names {
				path[i], _ = g.GetID(n)
				steps[i].StationName = n
				if i < len(lines) {
					steps[i].LineName = lines[i]
				}
			}
			var corrected, before []int
			if mode == "cheapest" {
				corrected, before, err = usecase.SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath(path, g, corrector, nil, zones, fareEval)
			} else {
				corrected, _, before, err = usecase.CorrectPathForModeWithRouteExtensionsAndPreShinkansenPath(path, g, corrector, nil, mode)
			}
			if err != nil {
				t.Fatal(err)
			}
			result, transformed, e := evaluator.ExecuteWithMode(corrected, 0, mode)
			if e != nil {
				t.Fatal(e)
			}
			wantKilo, wantFare := 879, 1460
			if mode == "uncorrect" {
				wantKilo, wantFare = 955, 1640
			}
			if int(result.TotalEigyoKilo) != wantKilo || result.TotalAmount() != wantFare {
				t.Fatalf("%s reverse=%v: distance=%v fare=%d", mode, reverse, result.TotalEigyoKilo, result.TotalAmount())
			}
			end := 0
			if reverse {
				end = len(result.FinalPath) - 1
			}
			if g.GetName(result.FinalPath[end]) != "大阪・新大阪" {
				t.Fatal("第88条未適用")
			}
			if days := usecase.CalculateTicketValidDays(result.TotalPathEigyoKilo, before, g); days != 1 {
				t.Fatalf("days=%d", days)
			}
			want := []string{"新大阪", "新幹線", "西明石", "山陽"}
			if mode != "uncorrect" {
				want = []string{"東海道", "山陽"}
			}
			if reverse {
				slices.Reverse(want)
			}
			got := usecase.GetCalculatedFareVia(mode, steps, path, transformed, result.FinalPath, g, zones)
			if !slices.Equal(got, want) {
				t.Fatalf("%s reverse=%v via=%v want=%v", mode, reverse, got, want)
			}
		}
	}
}

func TestConsecutiveKyushuOverlap(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, _ := graphio.LoadSpecialZones()
	e := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	fare := func(p []int) (int, error) {
		r, _, err := e.ExecuteWithMode(p, 0, "normal")
		if err != nil {
			return 0, err
		}
		return r.TotalAmount(), nil
	}
	c := usecase.NewPipelineCorrector(usecase.NewSuburbanAreaCorrector(fare), usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector())
	for _, reverse := range []bool{false, true} {
		for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
			names := []string{"柚須", "吉塚", "博多", "小倉", "西小倉", "南小倉"}
			lines := []string{"ササク", "カコシ", "シンカ", "カコシ", "ニツホ"}
			if reverse {
				slices.Reverse(names)
				slices.Reverse(lines)
			}
			path := make([]int, len(names))
			steps := make([]usecase.ViaStep, len(names))
			for i, n := range names {
				path[i], _ = g.GetID(n)
				steps[i].StationName = n
				if i < len(lines) {
					steps[i].LineName = lines[i]
				}
			}
			var p, before []int
			var err error
			if mode == "cheapest" {
				p, before, err = usecase.SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath(path, g, c, nil, zones, fare)
			} else {
				p, _, before, err = usecase.CorrectPathForModeWithRouteExtensionsAndPreShinkansenPath(path, g, c, nil, mode)
			}
			if err != nil {
				t.Fatal(err)
			}
			r, p, err := e.ExecuteWithMode(p, 0, mode)
			if err != nil {
				t.Fatal(err)
			}
			want := []string{"篠栗線", "新幹線", "日豊"}
			if reverse {
				slices.Reverse(want)
			}
			via := usecase.GetCalculatedFareVia(mode, steps, path, p, r.FinalPath, g, zones)
			if !slices.Equal(via, want) || r.TotalEigyoKilo != 698 || r.TotalAmount() != 1220 || usecase.CalculateTicketValidDays(r.TotalPathEigyoKilo, before, g) != 1 {
				t.Fatalf("%s reverse=%v via=%v kilo=%v fare=%d", mode, reverse, via, r.TotalEigyoKilo, r.TotalAmount())
			}
		}
	}
}
