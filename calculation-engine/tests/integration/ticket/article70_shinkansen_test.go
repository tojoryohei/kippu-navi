package ticket_test

import (
	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"io"
	"reflect"
	"slices"
	"testing"
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
		{"三河島から上野折り返しで小山", append(append(leg("シヨハ", "三河島"), leg("トウホ", "日暮里", "鶯谷")...), leg("トホシ", "上野", "大宮", "小山")...), 760, 1410, []string{"常磐", "上野", "新幹線", "小山"}, false},
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
			path, err := calculator.ResolvePath(steps)
			if err != nil {
				t.Fatal(err)
			}
			if tc.invalid {
				// 通常のCorrectと、入れ子の補正でも展開前の要求を保持する。
				if _, err := corrector.Correct(path, g); err == nil || err.Error() != "再考：要求区間誤り" {
					t.Fatalf("補正時のエラー = %v", err)
				}
				nested := usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewPipelineCorrector(usecase.NewArticle70Corrector(routes)))
				if _, err := nested.Correct(path, g); err == nil || err.Error() != "再考：要求区間誤り" {
					t.Fatalf("入れ子の補正時のエラー = %v", err)
				}
				if _, _, err := nested.CorrectWithPreShinkansenPath(path, g); err == nil || err.Error() != "再考：要求区間誤り" {
					t.Fatalf("入れ子の追跡付き補正時のエラー = %v", err)
				}
			}
			for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
				t.Run(tc.name+"/"+steps[0].StationName+"/"+mode, func(t *testing.T) {
					fare, _, err := calculator.Calculate(path, steps, mode)
					if tc.invalid && mode != "uncorrect" {
						if err == nil || err.Error() != "再考：要求区間誤り" {
							t.Fatalf("エラー = %v, 期待値 再考：要求区間誤り", err)
						}

						return
					}
					if err != nil {
						t.Fatal(err)
					}
					if mode != "uncorrect" && tc.kilo > 0 {
						if fare.DepartureStation != steps[0].StationName || fare.ArrivalStation != steps[len(steps)-1].StationName {
							t.Fatalf("予期しない端点です: %+v", fare)
						}
						if fare.TotalEigyoKilo != tc.kilo || fare.Fare != tc.fare || fare.ValidDays != 1 {
							t.Fatalf("運賃計算結果 = %+v、期待値は%d / %d / 有効期間1日", fare, tc.kilo, tc.fare)
						}
					}
					if mode == "normal" && wantVia != nil && !reflect.DeepEqual(fare.PrintedViaLines, wantVia) {
						t.Fatalf("経由 = %v, 期待値 %v", fare.PrintedViaLines, wantVia)
					}
				})
			}
		}
	}
}
