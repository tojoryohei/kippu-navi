package ticket_test

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"errors"
	"io"
	"reflect"
	"slices"
	"strings"
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
	t.Run("第70条補正で東京駅が重複する越中島発着", func(t *testing.T) {
		approach := leg("ケイヨ", strings.Fields("越中島 潮見 新木場 葛西臨海公園 舞浜 新浦安 市川塩浜 二俣新町 南船橋 新習志野 幕張豊砂 海浜幕張 検見川浜 稲毛海岸 千葉みなと")...)
		approach = append(approach, leg("ソトホ", "蘇我", "本千葉")...)
		approach = append(approach, leg("ソウフ", strings.Fields("千葉 西千葉 稲毛 新検見川 幕張 幕張本郷 津田沼 東船橋 船橋 西船橋 下総中山 本八幡 市川 小岩 新小岩 平井 亀戸")...)...)
		approach = append(approach, leg("ソウフ２", "錦糸町", "両国", "浅草橋")...)
		steps := append(approach, leg("トウホ２", strings.Fields("秋葉原 御徒町 上野 鶯谷 日暮里 西日暮里 田端 上中里 王子 東十条")...)...)
		steps = append(steps, leg("アカハ", "赤羽", "十条", "板橋")...)
		steps = append(steps, leg("ヤマテ２", strings.Fields("池袋 目白 高田馬場 新大久保 新宿 代々木 原宿 渋谷 恵比寿 目黒 五反田 大崎")...)...)
		steps = append(steps, usecase.ViaStep{StationName: "品川", LineName: "シンカ"})
		steps = append(steps, leg("ケイヨ", "東京", "八丁堀")...)
		steps = append(steps, usecase.ViaStep{StationName: "越中島"})
		path, err := calculator.ResolvePath(steps)
		if err != nil {
			t.Fatal(err)
		}
		for _, mode := range []string{"normal", "cheapest"} {
			if _, err := calculator.CalculateWithPricing(path, steps, mode, usecase.TicketPricingOptions{}); !errors.Is(err, domain.ErrDuplicateRoute) {
				t.Errorf("%s: 経路重複エラーを期待しましたが、実際は%vでした", mode, err)
			}
		}
		fare, err := calculator.CalculateWithPricing(path, steps, "uncorrect", usecase.TicketPricingOptions{})
		if err != nil || fare.Fare != 2420 {
			t.Fatalf("補正禁止モードで2,420円を期待しましたが、実際は%d円、エラー=%vでした", fare.Fare, err)
		}
	})
	t.Run("東京都区内を出て亀有に戻る", func(t *testing.T) {
		steps := leg("", strings.Fields(`金町 松戸 北松戸 馬橋 新松戸 南流山 （武蔵）三郷 新三郷 吉川美南 吉川 越谷レイクタウン 南越谷 東川口 東浦和 南浦和
   武蔵浦和 西浦和 北朝霞 新座 東所沢 新秋津 新小平 西国分寺 国立 立川 日野 豊田 八王子 片倉 八王子みなみ野 相原 （横）橋本
   南橋本 上溝 番田 原当麻 下溝 相武台下 入谷 海老名 厚木 社家 門沢橋 倉見 宮山 寒川 香川 北茅ケ崎 茅ケ崎 辻堂 藤沢 大船
   本郷台 港南台 洋光台 新杉田 磯子 （岸）根岸 山手 石川町 関内 桜木町 横浜 東神奈川 新子安 鶴見 川崎 蒲田 大森 大井町 品川
   高輪ゲートウェイ 田町 浜松町 新橋 有楽町 東京 上野 鶯谷 日暮里 三河島 南千住 北千住 綾瀬 亀有`)...)
		for i := range steps {
			if steps[i].StationName == "東京" {
				steps[i].LineName = "トホシ"
			}
		}
		path, err := calculator.ResolvePath(steps)
		if err != nil {
			t.Fatal(err)
		}
		fare, err := calculator.CalculateWithPricing(path, steps, "normal", usecase.TicketPricingOptions{})
		if err != nil {
			t.Fatal(err)
		}
		if fare.DepartureStation != "東京都区内" || fare.ArrivalStation != "亀有" || fare.TotalEigyoKilo != 2155 || fare.Fare != 3850 {
			t.Errorf("通常モードの計算結果 = %+v", fare)
		}
		single, err := calculator.CalculateWithPricing(path, steps, "normal", usecase.TicketPricingOptions{}, usecase.SingleStationOptions{DepartureSingleStation: true})
		if err != nil {
			t.Fatal(err)
		}
		if single.DepartureStation != "金町" || single.ArrivalStation != "亀有" || single.TotalEigyoKilo != 1979 || single.Fare != 3520 {
			t.Errorf("乗車駅単駅指定の計算結果 = %+v", single)
		}
	})

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
		{"太線区間を通過して東京上野を残す川崎発は有効", append(leg("トウカ", "川崎", "蒲田", "大森", "大井町", "品川", "高輪ゲートウェイ", "田町", "浜松町", "新橋", "有楽町"), append(leg("トホシ", "東京"), toOmiya...)...), 0, 0, nil, false},
		{"大久保から東京上野だけ新幹線で三河島", append(append(append(leg("チユト", "（中）大久保"), central...), leg("トホシ", "東京")...), append(leg("トウホ", "上野", "鶯谷"), leg("シヨハ", "日暮里", "三河島")...)...), 0, 0, nil, true},
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
				if _, err := corrector.Correct(path, g); !errors.Is(err, domain.ErrRequestedSection) {
					t.Fatalf("補正時のエラー = %v", err)
				}
				nested := usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewPipelineCorrector(usecase.NewArticle70Corrector(routes)))
				if _, err := nested.Correct(path, g); !errors.Is(err, domain.ErrRequestedSection) {
					t.Fatalf("入れ子の補正時のエラー = %v", err)
				}
				if _, _, err := nested.CorrectWithPreShinkansenPath(path, g); !errors.Is(err, domain.ErrRequestedSection) {
					t.Fatalf("入れ子の追跡付き補正時のエラー = %v", err)
				}
			}
			for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
				t.Run(tc.name+"/"+steps[0].StationName+"/"+mode, func(t *testing.T) {
					fare, _, err := calculator.Calculate(path, steps, mode)
					if tc.invalid && mode != "uncorrect" {
						if !errors.Is(err, domain.ErrRequestedSection) {
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
