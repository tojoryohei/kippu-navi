package ticket_test

import (
	"io"
	"reflect"
	"slices"
	"testing"

	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
)

func TestArticle70Shinkansen(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	data, err := io.ReadAll(graphdata.GetArticle70RoutesReader())
	if err != nil {
		t.Fatal(err)
	}
	routes, err := ticketdomain.LoadArticle70RoutesFromBytes(data)
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	corrector := usecase.NewPipelineCorrector(
		usecase.NewSuburbanAreaCorrector(func(path []int) (int, error) {
			result, _, err := evaluator.ExecuteWithMode(path, 0, "normal")
			if err != nil {
				return 0, err
			}
			return result.TotalAmount(), nil
		}),
		usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(),
		usecase.NewRule69Corrector(), usecase.NewRule157Corrector(), usecase.NewArticle70Corrector(routes),
	)
	calculator := usecase.NewRouteTicketCalculator(g, corrector, evaluator, nil, zones)
	leg := func(line string, names ...string) []usecase.ViaStep {
		steps := make([]usecase.ViaStep, len(names))
		for i, name := range names {
			steps[i] = usecase.ViaStep{StationName: name, LineName: line}
		}
		return steps
	}
	central := leg("チユト", "新宿", "代々木", "千駄ケ谷", "信濃町", "四ツ谷", "市ケ谷", "飯田橋", "水道橋", "御茶ノ水", "神田")
	meguro := leg("ヤマテ", "目黒", "五反田", "大崎", "品川", "高輪ゲートウェイ", "田町", "浜松町", "新橋", "有楽町")
	toOmiya := leg("トウホ", "上野", "鶯谷", "日暮里", "尾久", "赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮")
	for _, tc := range []struct {
		name       string
		steps      []usecase.ViaStep
		kilo, fare int
		via        []string
		invalid    bool
	}{
		{"水道橋から東京上野だけ新幹線", append(append(slices.Clone(central[7:]), leg("トホシ", "東京")...), toOmiya...), 0, 0, nil, true},
		{"新宿から東京乗換で小山", append(slices.Clone(central), leg("トホシ", "東京", "上野", "大宮", "小山")...), 777, 1410, []string{"東京", "新幹線", "小山"}, false},
		{"目黒から上野乗換で小山", append(append(slices.Clone(meguro), leg("トウホ", "東京", "神田", "秋葉原", "御徒町")...), leg("トホシ", "上野", "大宮", "小山")...), 842, 1600, []string{"上野", "新幹線", "小山"}, false},
		{"目黒から東京乗換で小山も有効", append(slices.Clone(meguro), leg("トホシ", "東京", "上野", "大宮", "小山")...), 842, 1600, []string{"東京", "新幹線", "小山"}, false},
		{"東京上野を残す新橋発は有効", append(leg("トウカ", "新橋", "有楽町"), append(leg("トホシ", "東京"), toOmiya...)...), 0, 0, nil, false},
		{"高輪ゲートウェイから東京上野だけ北陸新幹線", append(leg("トウカ", "高輪ゲートウェイ", "田町", "浜松町", "新橋", "有楽町"), append(leg("ホクシ", "東京"), toOmiya[:len(toOmiya)-1]...)...), 346, 620, []string{"東海道", "東京", "新幹線", "上野", "東北", "山手", "東北"}, false},
		{"太線区間内完結には追加判定しない", leg("トホシ", "東京", "上野"), 0, 0, nil, false},
		{"太線区間の通過には追加判定しない", append(leg("トウカ", "川崎", "蒲田", "大森", "大井町", "品川", "高輪ゲートウェイ", "田町", "浜松町", "新橋", "有楽町"), append(leg("トホシ", "東京"), toOmiya...)...), 0, 0, nil, false},
	} {
		for _, reverse := range []bool{false, true} {
			steps := slices.Clone(tc.steps)
			wantVia := slices.Clone(tc.via)
			if reverse {
				for i := range steps {
					steps[i].StationName = tc.steps[len(steps)-1-i].StationName
					if i+1 < len(steps) {
						steps[i].LineName = tc.steps[len(steps)-2-i].LineName
					}
				}
				slices.Reverse(wantVia)
			}
			steps[len(steps)-1].LineName = ""
			for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
				t.Run(tc.name+"/"+steps[0].StationName+"/"+mode, func(t *testing.T) {
					path, err := calculator.ResolvePath(steps)
					if err != nil {
						t.Fatal(err)
					}
					fare, _, err := calculator.Calculate(path, steps, mode)
					if tc.invalid && mode != "uncorrect" {
						if err == nil || err.Error() != "再考：要求区間誤り" {
							t.Fatalf("error = %v, want 再考：要求区間誤り", err)
						}
						// 通常のCorrectと、入れ子の補正でも展開前の要求を保持する。
						if _, err := corrector.Correct(path, g); err == nil || err.Error() != "再考：要求区間誤り" {
							t.Fatalf("Correct error = %v", err)
						}
						nested := usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewPipelineCorrector(usecase.NewArticle70Corrector(routes)))
						if _, err := nested.Correct(path, g); err == nil || err.Error() != "再考：要求区間誤り" {
							t.Fatalf("nested Correct error = %v", err)
						}
						if _, _, err := nested.CorrectWithPreShinkansenPath(path, g); err == nil || err.Error() != "再考：要求区間誤り" {
							t.Fatalf("nested traced correction error = %v", err)
						}
						return
					}
					if err != nil {
						t.Fatal(err)
					}
					if mode != "uncorrect" && tc.kilo > 0 {
						if fare.DepartureStation != steps[0].StationName || fare.ArrivalStation != steps[len(steps)-1].StationName {
							t.Fatalf("unexpected endpoints: %+v", fare)
						}
						if fare.TotalEigyoKilo != tc.kilo || fare.Fare != tc.fare || fare.ValidDays != 1 {
							t.Fatalf("fare = %+v, want %d / %d / 1 day", fare, tc.kilo, tc.fare)
						}
					}
					if mode == "normal" && wantVia != nil && !reflect.DeepEqual(fare.PrintedViaLines, wantVia) {
						t.Fatalf("via = %v, want %v", fare.PrintedViaLines, wantVia)
					}
				})
			}
		}
	}
}
