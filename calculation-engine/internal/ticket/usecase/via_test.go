package usecase

import (
	"encoding/json"
	"reflect"
	"testing"

	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
)

func TestInputViaKanasCollapsesOnlyAdjacentDuplicates(t *testing.T) {
	path := []ViaStep{
		{StationName: "東京", LineName: "トウホ"},
		{StationName: "神田", LineName: "トウホ"},
		{StationName: "秋葉原", LineName: "チユト"},
		{StationName: "御茶ノ水", LineName: "トウホ"},
		{StationName: "上野"},
	}
	want := []string{"トウホ", "チユト", "トウホ"}
	if got := inputViaKanas(path); !reflect.DeepEqual(got, want) {
		t.Fatalf("input via kanas = %v, want %v", got, want)
	}
}

func TestSpecialViaInputAndAutomaticSelection(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	negishi := []string{"横浜", "桜木町", "関内", "石川町", "山手", "（岸）根岸", "磯子", "新杉田", "洋光台", "港南台", "本郷台", "大船"}
	for _, tt := range []struct {
		name             string
		stations         []string
		input, automatic []string
		inputCodes       []string
	}{
		{"母線内方から横浜", []string{"戸塚", "東戸塚", "保土ケ谷", "横浜", "桜木町", "関内"}, []string{"東海道", "桜木町"}, []string{"東海道", "桜木町"}, []string{"トウカ", "ネキシヨ"}},
		{"母線内方から大船", []string{"戸塚", "大船", "本郷台"}, []string{"東海道", "本郷台"}, []string{"東海道", "本郷台"}, []string{"トウカ", "ネキシオ"}},
		{"母線外方では入力方法で異なる", []string{"東神奈川", "横浜", "桜木町", "関内"}, []string{"東海道", "桜木町"}, []string{"東海道", "根岸線"}, nil},
		{"外方から外方へ通過", append(append([]string{"東神奈川"}, negishi...), "藤沢"), []string{"東海道", "根岸線", "東海道"}, []string{"東海道", "根岸線", "東海道"}, nil},
		{"片方が内方なら両側のコード", append(append([]string{"保土ケ谷"}, negishi...), "藤沢"), []string{"東海道", "桜木町", "本郷台", "東海道"}, []string{"東海道", "桜木町", "本郷台", "東海道"}, nil},
		{"別路線から接続", []string{"北鎌倉", "大船", "本郷台"}, []string{"横須賀線", "根岸線"}, []string{"横須賀線", "根岸線"}, nil},
		{"例外路線で別路線から接続", []string{"東新潟", "新潟", "上所"}, []string{"白新", "越後"}, []string{"白新", "上所"}, nil},
		{"例外路線の接続駅発", []string{"三原", "須波", "安芸幸崎"}, []string{"須波"}, []string{"須波"}, nil},
		{"例外路線の途中駅相互", []string{"須波", "安芸幸崎", "忠海"}, []string{"呉線"}, []string{"呉線"}, nil},
	} {
		t.Run(tt.name, func(t *testing.T) {
			for _, reverse := range []bool{false, true} {
				names, wantInput, wantAuto, wantCodes := tt.stations, tt.input, tt.automatic, tt.inputCodes
				if reverse {
					names, wantInput, wantAuto = reverseStrings(names), reverseStrings(wantInput), reverseStrings(wantAuto)
					wantCodes = reverseStrings(wantCodes)
				}
				ids := make([]int, len(names))
				for i, name := range names {
					var ok bool
					ids[i], ok = g.GetID(name)
					if !ok {
						t.Fatalf("missing station %s", name)
					}
				}
				steps := physicalViaSteps(g, ids)
				if got := GetFareVia(steps); !reflect.DeepEqual(got, wantInput) {
					t.Fatalf("input (%v) = %v, want %v", names, got, wantInput)
				}
				if got := GetSplitVia(g, ids); !reflect.DeepEqual(got, wantAuto) {
					t.Fatalf("automatic (%v) = %v, want %v", names, got, wantAuto)
				}
				if len(wantCodes) > 0 {
					if got := inputViaKanas(steps); !reflect.DeepEqual(got, wantCodes) {
						t.Fatalf("logged kana = %v, want %v", got, wantCodes)
					}
				}
			}
		})
	}
}

func TestSpecialViaWithCorrectionAndOmission(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	ids := func(names ...string) []int {
		path := make([]int, len(names))
		for i, name := range names {
			var ok bool
			path[i], ok = g.GetID(name)
			if !ok {
				t.Fatalf("missing station %s", name)
			}
		}
		return path
	}
	// 内方からの入力で選択した特殊表記は、補正後が外方でも保持する。
	sourceNames := []string{"本千葉", "千葉", "東千葉", "都賀", "四街道", "物井", "佐倉", "南酒々井", "榎戸", "八街", "日向", "成東", "求名", "東金", "福俵", "大網", "土気", "誉田", "鎌取", "蘇我", "浜野"}
	printedNames := []string{"本千葉", "蘇我", "浜野"}
	for _, reverse := range []bool{false, true} {
		source, printed := ids(sourceNames...), ids(printedNames...)
		want := []string{"外房", "浜野"}
		if reverse {
			source, printed = ids(reverseStrings(sourceNames)...), ids(reverseStrings(printedNames)...)
			want = reverseStrings(want)
		}
		if got := GetSplitViaForResult(g, source, printed); !reflect.DeepEqual(got, want) {
			t.Fatalf("corrected split via = %v, want %v", got, want)
		}
		// 最安は補正前の内方接続を引き継がず、補正後の外方接続で判定する。
		want = []string{"外房", "内房"}
		if reverse {
			want = reverseStrings(want)
		}
		if got := GetCheapestFareViaForResult(g, printed, printed); !reflect.DeepEqual(got, want) {
			t.Fatalf("cheapest via = %v, want %v", got, want)
		}
	}
	// 69条で省略される呉線は、接続駅発の特殊コードも印字しない。
	branch := NewRule69Corrector().rules[7].from
	path := ids(branch...)
	steps := physicalViaSteps(g, path)
	if got := GetFareVia(steps); !reflect.DeepEqual(got, []string{"須波", "矢野"}) {
		t.Fatalf("unfiltered via = %v", got)
	}
	if got := GetFareViaForResultWithSections(steps, path, g, nil); len(got) != 0 {
		t.Fatalf("omitted fare via = %v", got)
	}
	if got := GetSplitViaForResult(g, path, path); len(got) != 0 {
		t.Fatalf("omitted split via = %v", got)
	}
}

func TestRule157ViaReplacement(t *testing.T) {
	for _, tt := range []struct {
		name                    string
		rule                    int
		before, after           string
		want, uncorrect, logged []string
	}{
		{"赤穂線を山陽に置換して前後と集約", 3, "竜野", "高島", []string{"山陽"}, []string{"山陽", "赤穂", "山陽"}, []string{"サンヨ", "アコウ", "サンヨ"}},
		{"新幹線と接続駅を東海道と山陽に置換", 1, "天満", "（陽）大久保", []string{"大阪環状", "東海道", "山陽"}, []string{"大阪環状", "東海道", "新大阪", "新幹線", "西明石", "山陽"}, []string{"オオサ", "トウカ", "オサシオＢ", "シンカ", "オサニアＢ", "サンヨ"}},
		{"西明石から姫路への新幹線を残す", 1, "天満", "姫路", []string{"大阪環状", "東海道", "山陽", "西明石", "新幹線", "姫路"}, []string{"大阪環状", "東海道", "新大阪", "新幹線", "姫路"}, []string{"オオサ", "トウカ", "オサシオＢ", "シンカ", "オサヒメＢ"}},
		{"第27号で東淀川方面から在来線に置換", 2, "東淀川", "姫路", []string{"東海道", "山陽", "西明石", "新幹線", "姫路"}, []string{"東海道", "新大阪", "新幹線", "姫路"}, []string{"トウカ", "オサシオＢ", "シンカ", "オサヒメＢ"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			rule := NewRule157Corrector().rules[tt.rule]
			for _, reverse := range []bool{false, true} {
				source := append(append([]string{tt.before}, rule.from...), tt.after)
				printed := append(append([]string{tt.before}, rule.to...), tt.after)
				want, uncorrect, logged := tt.want, tt.uncorrect, tt.logged
				if reverse {
					source, printed = reverseStrings(source), reverseStrings(printed)
					want, uncorrect, logged = reverseStrings(want), reverseStrings(uncorrect), reverseStrings(logged)
				}
				g := graph.NewGraph(len(source) + len(printed))
				ids := func(names []string) []int {
					path := make([]int, len(names))
					for i, name := range names {
						path[i] = g.GetOrAddID(name)
					}
					return path
				}
				sourcePath, printedPath := ids(source), ids(printed)
				corrected, err := NewRule157Corrector().Correct(sourcePath, g)
				if err != nil || !reflect.DeepEqual(corrected, printedPath) {
					t.Fatalf("corrected path (reverse=%v) = %v, err=%v, want %v", reverse, corrected, err, printedPath)
				}
				steps := physicalViaSteps(g, sourcePath)
				for i := 0; i < len(steps)-1; i++ {
					pair := stationPair(steps[i].StationName, steps[i+1].StationName)
					if pair == stationPair("新大阪", "新神戸") || pair == stationPair("新神戸", "西明石") || pair == stationPair("西明石", "姫路") {
						steps[i].LineName = "シンカ"
					}
				}
				if got := GetFareViaForResultWithSections(steps, printedPath, g, nil); !reflect.DeepEqual(got, want) {
					t.Fatalf("normal (reverse=%v) = %v, want %v", reverse, got, want)
				}
				if got := GetFareViaForResult(steps, sourcePath, g, nil); !reflect.DeepEqual(got, uncorrect) {
					t.Fatalf("uncorrect = %v, want %v", got, uncorrect)
				}
				if got := inputViaKanas(steps); !reflect.DeepEqual(got, logged) {
					t.Fatalf("logged = %v, want %v", got, logged)
				}
				if tt.rule == 3 {
					if got := GetSplitViaForResult(g, sourcePath, printedPath); !reflect.DeepEqual(got, want) {
						t.Fatalf("split = %v, want %v", got, want)
					}
				}
				if got := GetCheapestFareViaForResult(g, printedPath, printedPath); !reflect.DeepEqual(got, want) {
					t.Fatalf("cheapest = %v, want %v", got, want)
				}
				if tt.rule == 1 || tt.rule == 2 {
					// 大阪側が環状線ではなく塚本方面なら、この157条の条件に該当しない。
					outside := 0
					if reverse {
						outside = len(steps) - 1
					}
					steps[outside].StationName = "塚本"
					if sections := findRule157ViaSections(viaStepNames(steps)); len(sections) != 0 {
						t.Fatalf("unexpected replacement: %v", sections)
					}
				}
			}
		})
	}
}

func TestGetFareViaUsesInputLine(t *testing.T) {
	tests := []struct {
		name string
		line string
		want []string
	}{
		{"東北", "トウホ", []string{"東北"}},
		{"中央", "チユト", []string{"中央東"}},
		{"印字なし", "トウホ２", []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := GetFareVia([]ViaStep{{"東京", tt.line}, {"神田", ""}})
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("GetFareVia() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetFareViaShinkansenAndPrivateBoundary(t *testing.T) {
	tests := []struct {
		name string
		path []ViaStep
		want []string
	}{
		{
			"新幹線の発着駅と在来線への接続",
			[]ViaStep{{"東京", "トホシ"}, {"上野", "トウホ"}, {"大宮", ""}},
			[]string{"東京", "新幹線", "上野", "東北"},
		},
		{
			"私鉄の両接続駅",
			[]ViaStep{{"A", "トウホ"}, {"B", "201"}, {"C", "201"}, {"D", "チユト"}, {"E", ""}},
			[]string{"東北", "B", "D", "中央東"},
		},
		{
			"現在の私鉄コードでJRから私鉄へ接続",
			[]ViaStep{{"大阪", "オオサ"}, {"鶴橋", "近鉄線"}, {"伊勢中川", "近鉄線"}, {"松阪", ""}},
			[]string{"大阪環状", "鶴橋", "近鉄線"},
		},
		{
			"現在の私鉄コードで私鉄からJRへ接続",
			[]ViaStep{{"松阪", "近鉄線"}, {"鶴橋", "オオサ"}, {"大阪", ""}},
			[]string{"近鉄線", "鶴橋", "大阪環状"},
		},
		{
			"異なる私鉄線の接続駅",
			[]ViaStep{{"和倉温泉", "ナナオ"}, {"津幡", "いしかわ"}, {"倶利伽羅", "とやま鉄道"}, {"高岡", "シヨウ"}, {"新高岡", ""}},
			[]string{"七尾線", "津幡", "ＩＲいしかわ", "倶利伽羅", "あいの風とやま", "高岡", "城端線"},
		},
		{
			"私鉄始発と私鉄終着の駅は印字しない",
			[]ViaStep{{"松阪", "近鉄線"}, {"鶴橋", "オオサ"}, {"大阪", "近鉄線"}, {"伊勢中川", ""}},
			[]string{"近鉄線", "鶴橋", "大阪環状", "大阪", "近鉄線"},
		},
		{
			"新幹線から私鉄への接続駅は一度だけ印字",
			[]ViaStep{{"東京", "シンカ"}, {"名古屋", "近鉄線"}, {"伊勢中川", ""}},
			[]string{"東京", "新幹線", "名古屋", "近鉄線"},
		},
		{
			"連続路線",
			[]ViaStep{{"東京", "トウホ"}, {"神田", "トウホ"}, {"秋葉原", ""}},
			[]string{"東北"},
		},
		{
			"印字名のない区間は路線切替とみなさない",
			[]ViaStep{{"東京", "トウホ"}, {"神田", "トウホ２"}, {"秋葉原", "トウホ"}, {"御徒町", ""}},
			[]string{"東北"},
		},
		{
			"市内発着でも実際の新幹線駅を印字",
			[]ViaStep{{"広島", "シンカ"}, {"新神戸", ""}},
			[]string{"広島", "新幹線", "新神戸"},
		},
		{
			"大阪環状線の追加駅名",
			[]ViaStep{{"天満", "オオサ"}, {"桜ノ宮", "オオサ"}, {"京橋", "オオサ"}, {"大阪城公園", ""}},
			[]string{"大阪環状", "京橋"},
		},
		{
			"大阪環状線の西九条",
			[]ViaStep{{"野田", "オオサ"}, {"西九条", "オオサ"}, {"弁天町", ""}},
			[]string{"大阪環状", "西九条"},
		},
		{
			"おおさか東線の鴫野放出間",
			[]ViaStep{{"鴫野", "オサヒ"}, {"放出", "オサヒ"}, {"久宝寺", ""}},
			[]string{"おおさか東"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := GetFareVia(tt.path); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("GetFareVia() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetFareViaForResultOmitsAppliedZones(t *testing.T) {
	zones := &graphio.SpecialZoneRegistry{Zones: []ticketdomain.SpecialZone{
		{Name: "東京都区内", Stations: []string{"新宿", "上野", "品川"}},
		{Name: "東京山手線内", Stations: []string{"新宿", "上野", "品川"}},
		{Name: "大阪市内", Stations: []string{"大阪", "京橋", "新大阪"}},
	}}
	tests := []struct {
		name      string
		path      []ViaStep
		finalPath []string
		want      []string
	}{
		{
			"特例不適用",
			[]ViaStep{{"東京", "チユト"}, {"神田", ""}},
			[]string{"東京", "神田"},
			[]string{"中央東"},
		},
		{
			"発側の市内印字を除外して同一路線の市外部分を残す",
			[]ViaStep{{"新宿", "チユト"}, {"上野", "トウホ"}, {"大宮", "トウホ"}, {"小山", ""}},
			[]string{"東京都区内", "上野", "大宮", "小山"},
			[]string{"東北"},
		},
		{
			"着側の市内印字を除外",
			[]ViaStep{{"小山", "トウホ"}, {"大宮", "トウホ"}, {"上野", "チユト"}, {"新宿", ""}},
			[]string{"小山", "大宮", "上野", "東京都区内"},
			[]string{"東北"},
		},
		{
			"発着両側の市内印字を除外",
			[]ViaStep{{"新宿", "チユト"}, {"上野", "トウホ"}, {"大宮", "トウホ"}, {"新大阪", "オオサ"}, {"京橋", ""}},
			[]string{"東京都区内", "上野", "大宮", "新大阪", "大阪市内"},
			[]string{"東北"},
		},
		{
			"東京山手線内も除外",
			[]ViaStep{{"新宿", "チユト"}, {"上野", "トウホ"}, {"大宮", ""}},
			[]string{"東京山手線内", "上野", "大宮"},
			[]string{"東北"},
		},
		{
			"東京都区内発の新幹線では品川を印字しない",
			[]ViaStep{{"東京", "トウカ"}, {"品川", "シンカ"}, {"新横浜", "シンカ"}, {"名古屋", ""}},
			[]string{"東京都区内", "品川", "新横浜", "名古屋"},
			[]string{"新幹線", "名古屋"},
		},
		{
			"東京山手線内着の新幹線では上野を印字しない",
			[]ViaStep{{"大宮", "トホシ"}, {"上野", "トウホ"}, {"東京", ""}},
			[]string{"大宮", "上野", "東京山手線内"},
			[]string{"大宮", "新幹線"},
		},
		{
			"東京山手線内発の新幹線では上野を印字しない",
			[]ViaStep{{"東京", "トウホ"}, {"上野", "トホシ"}, {"大宮", ""}},
			[]string{"東京山手線内", "上野", "大宮"},
			[]string{"新幹線", "大宮"},
		},
		{
			"東京都区内着の新幹線では品川を印字しない",
			[]ViaStep{{"名古屋", "シンカ"}, {"新横浜", "シンカ"}, {"品川", "トウカ"}, {"東京", ""}},
			[]string{"名古屋", "新横浜", "品川", "東京都区内"},
			[]string{"名古屋", "新幹線"},
		},
		{
			"大阪駅を通らず新大阪から出る大阪市内",
			[]ViaStep{{"京橋", "オオサ"}, {"新大阪", "シンカ"}, {"新神戸", ""}},
			[]string{"大阪市内", "新大阪", "新神戸"},
			[]string{"新大阪", "新幹線", "新神戸"},
		},
		{
			"大阪駅を通らず新大阪から入る大阪市内",
			[]ViaStep{{"新神戸", "シンカ"}, {"新大阪", "オオサ"}, {"京橋", ""}},
			[]string{"新神戸", "新大阪", "大阪市内"},
			[]string{"新神戸", "新幹線", "新大阪"},
		},
		{
			"大阪市内発の大阪〜新大阪を省略",
			[]ViaStep{{"大阪", "トウカ"}, {"新大阪", "シンカ"}, {"新神戸", ""}},
			[]string{"大阪市内", "新大阪", "新神戸"},
			[]string{"新大阪", "新幹線", "新神戸"},
		},
		{
			"大阪市内着の新大阪〜大阪を省略",
			[]ViaStep{{"新神戸", "シンカ"}, {"新大阪", "トウカ"}, {"大阪", ""}},
			[]string{"新神戸", "新大阪", "大阪市内"},
			[]string{"新神戸", "新幹線", "新大阪"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			g := graph.NewGraph(len(tt.finalPath))
			finalPath := make([]int, len(tt.finalPath))
			for i, name := range tt.finalPath {
				finalPath[i] = g.GetOrAddID(name)
			}
			if got := GetFareViaForResult(tt.path, finalPath, g, zones); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("GetFareViaForResult() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestOsakaShinOsakaViaUsesTwoStationZone(t *testing.T) {
	for _, tt := range []struct {
		name       string
		steps      []ViaStep
		finalNames []string
		want       []string
	}{
		{"大阪発・新幹線", []ViaStep{{"大阪", "トウカ"}, {"新大阪", "シンカ"}, {"岡山", ""}}, []string{"大阪・新大阪", "大阪", "新大阪", "岡山"}, []string{"新大阪", "新幹線", "岡山"}},
		{"大阪着・新幹線", []ViaStep{{"岡山", "シンカ"}, {"新大阪", "トウカ"}, {"大阪", ""}}, []string{"岡山", "新大阪", "大阪", "大阪・新大阪"}, []string{"岡山", "新幹線", "新大阪"}},
		{"新大阪発・大阪経由", []ViaStep{{"新大阪", "トウカ"}, {"大阪", "オオサ"}, {"天満", ""}}, []string{"大阪・新大阪", "大阪", "天満"}, []string{"大阪環状"}},
		{"新大阪着・大阪経由", []ViaStep{{"天満", "オオサ"}, {"大阪", "トウカ"}, {"新大阪", ""}}, []string{"天満", "大阪", "大阪・新大阪"}, []string{"大阪環状"}},
		{"同駅間なし", []ViaStep{{"大阪", "トウカ"}, {"尼崎", ""}}, []string{"大阪・新大阪", "大阪", "尼崎"}, []string{"東海道"}},
		{"特例なし", []ViaStep{{"大阪", "トウカ"}, {"新大阪", "シンカ"}, {"岡山", ""}}, []string{"大阪", "新大阪", "岡山"}, []string{"東海道", "新大阪", "新幹線", "岡山"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			g := graph.NewGraph(len(tt.finalNames))
			finalPath := make([]int, len(tt.finalNames))
			for i, name := range tt.finalNames {
				finalPath[i] = g.GetOrAddID(name)
			}
			for _, withSections := range []bool{false, true} {
				got := GetFareViaForResult(tt.steps, finalPath, g, nil)
				if withSections {
					got = GetFareViaForResultWithSections(tt.steps, finalPath, g, nil)
				}
				if !reflect.DeepEqual(got, tt.want) {
					t.Fatalf("withSections=%v: fare via = %v, want %v", withSections, got, tt.want)
				}
			}
		})
	}
}

func TestCheapestFareViaOmitsOsakaShinOsakaOnlyForFare(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	zoneID := g.GetOrAddID("大阪・新大阪")
	ids := func(names ...string) []int {
		path := make([]int, len(names))
		for i, name := range names {
			path[i] = g.GetOrAddID(name)
		}
		return path
	}
	for _, tt := range []struct {
		name  string
		path  []int
		print []int
		final []int
		want  []string
	}{
		{"発側", ids("新大阪", "大阪", "天満"), append([]int{zoneID}, ids("大阪", "天満")...), append([]int{zoneID}, ids("大阪", "天満")...), []string{"大阪環状"}},
		{"着側", ids("天満", "大阪", "新大阪"), append(ids("天満", "大阪"), zoneID), append(ids("天満", "大阪"), zoneID), []string{"大阪環状"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := GetCheapestFareViaForResult(g, tt.print, tt.final); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("cheapest fare via = %v, want %v", got, tt.want)
			}
			wantSplit := []string{"東海道", "大阪環状"}
			if tt.name == "着側" {
				wantSplit = []string{"大阪環状", "東海道"}
			}
			if got := GetSplitViaForResult(g, tt.path, tt.path); !reflect.DeepEqual(got, wantSplit) {
				t.Fatalf("split via = %v, want %v", got, wantSplit)
			}
		})
	}
}

func TestOsakaShinOsakaViaBoundsSkipsVirtualEndpoint(t *testing.T) {
	g := graph.NewGraph(5)
	zone := g.GetOrAddID("大阪・新大阪")
	for _, tt := range []struct {
		names     []string
		finalPath []int
		wantStart int
		wantEnd   int
	}{
		{[]string{"大阪・新大阪", "大阪", "新大阪", "岡山"}, []int{zone, g.GetOrAddID("大阪"), g.GetOrAddID("岡山")}, 2, 3},
		{[]string{"岡山", "新大阪", "大阪", "大阪・新大阪"}, []int{g.GetOrAddID("岡山"), g.GetOrAddID("大阪"), zone}, 0, 1},
	} {
		start, end := osakaShinOsakaViaBounds(tt.names, tt.finalPath, g)
		if start != tt.wantStart || end != tt.wantEnd {
			t.Fatalf("bounds(%v) = (%d, %d), want (%d, %d)", tt.names, start, end, tt.wantStart, tt.wantEnd)
		}
	}
}

func TestGetFareViaForResultShinkansenOverlap(t *testing.T) {
	zones := &graphio.SpecialZoneRegistry{Zones: []ticketdomain.SpecialZone{
		{Name: "東京都区内", Stations: []string{"東京", "品川"}},
		{Name: "名古屋市内", Stations: []string{"名古屋", "尾頭橋", "（中）金山", "鶴舞", "大曽根"}},
	}}
	path := []ViaStep{
		{"東京", "シンカ"}, {"品川", "シンカ"}, {"三河安城", "シンカ"},
		{"名古屋", "トウカ"}, {"尾頭橋", "トウカ"}, {"（中）金山", "チユサ"},
		{"鶴舞", "チユサ"}, {"大曽根", "チユサ"}, {"中津川", ""},
	}
	for _, tt := range []struct {
		name      string
		finalPath []string
		want      []string
	}{
		{"市外までの折り返し", []string{"東京都区内", "品川", "三河安城", "（中）金山", "鶴舞", "中津川"}, []string{"新幹線", "中央西"}},
		{"名古屋市内着", []string{"東京都区内", "品川", "三河安城", "名古屋", "名古屋市内"}, []string{"新幹線", "名古屋"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			g := graph.NewGraph(len(tt.finalPath))
			ids := make([]int, len(tt.finalPath))
			for i, name := range tt.finalPath {
				ids[i] = g.GetOrAddID(name)
			}
			if got := GetFareViaForResult(path, ids, g, zones); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRemoveOverlapViaReverseDirection(t *testing.T) {
	path := []ViaStep{{"鶴舞", "チユサ"}, {"（中）金山", "トウカ"}, {"尾頭橋", "トウカ"}, {"名古屋", "シンカ"}, {"三河安城", ""}}
	want := []string{"中央西", "新幹線", "三河安城"}
	if got := GetFareVia(removeOverlapVia(path)); !reflect.DeepEqual(got, want) {
		t.Fatalf("got %v, want %v", got, want)
	}
}

func TestRemoveOverlapViaKeepsUncorrectedTurnaround(t *testing.T) {
	path := []ViaStep{{"岐阜羽島", "シンカ"}, {"名古屋", "トウカ"}, {"尾頭橋", "トウカ"}, {"（中）金山", "チユサ"}, {"鶴舞", ""}}
	if got := removeOverlapVia(path); !reflect.DeepEqual(got, path) {
		t.Fatalf("non-deducted path changed: %v", got)
	}
}

func TestRemoveOverlapViaUenoNippori(t *testing.T) {
	for _, tt := range []struct {
		name string
		path []ViaStep
		want []string
	}{
		{"日暮里から上野", []ViaStep{{"三河島", "シヨハ"}, {"日暮里", "トウホ"}, {"鶯谷", "トウホ"}, {"上野", "トホシ"}, {"大宮", ""}}, []string{"常磐", "新幹線", "大宮"}},
		{"上野から日暮里", []ViaStep{{"大宮", "トホシ"}, {"上野", "トウホ"}, {"鶯谷", "トウホ"}, {"日暮里", "シヨハ"}, {"三河島", ""}}, []string{"大宮", "新幹線", "常磐"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			if got := GetFareVia(removeOverlapVia(tt.path)); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("got %v, want %v", got, tt.want)
			}
		})
	}
}

func TestFareViaKokuraShinkansenOverlap(t *testing.T) {
	path := []ViaStep{
		{"行橋", "ニツホ"}, {"小波瀬西工大前", "ニツホ"},
		{"苅田", "ニツホ"}, {"朽網", "ニツホ"}, {"下曽根", "ニツホ"},
		{"安部山公園", "ニツホ"}, {"城野", "ニツホ"},
		{"南小倉", "ニツホ"}, {"西小倉", "ニツホ"},
		{"小倉", "シンカ"}, {"博多", ""},
	}
	g := graph.NewGraph(len(path))
	finalPath := make([]int, len(path))
	for i, step := range path {
		finalPath[i] = g.GetOrAddID(step.StationName)
	}
	want := []string{"日豊", "新幹線", "博多"}
	if got := GetFareViaForResult(path, finalPath, g, nil); !reflect.DeepEqual(got, want) {
		t.Fatalf("GetFareViaForResult() = %v, want %v", got, want)
	}
}

func TestOverlapViaBranchesMatchFareCorrectionRules(t *testing.T) {
	deductions := NewShinkansenOverlapCorrector().overlapDeductions
	var shinkansenEdges []edgeLineRecord
	if err := json.NewDecoder(graphdata.GetShinkansenEdgesReader()).Decode(&shinkansenEdges); err != nil {
		t.Fatal(err)
	}
	shinkansenPairs := make(map[string]bool, len(shinkansenEdges))
	for _, edge := range shinkansenEdges {
		shinkansenPairs[stationPair(edge.Station0, edge.Station1)] = true
	}
	var physicalEdges []edgeLineRecord
	if err := json.NewDecoder(graphdata.GetEdgesReader()).Decode(&physicalEdges); err != nil {
		t.Fatal(err)
	}
	physicalPairs := make(map[string]bool, len(physicalEdges))
	for _, edge := range physicalEdges {
		physicalPairs[stationPair(edge.Station0, edge.Station1)] = true
	}
	if len(deductions) != 13 || len(overlapViaBranches) != len(deductions)+2 {
		t.Fatalf("printing branches=%d, fare deductions=%d", len(overlapViaBranches), len(deductions))
	}
	for i, rule := range overlapViaBranches {
		if i < len(deductions) {
			fareBranch := deductions[i][:len(rule.branch)]
			if !reflect.DeepEqual(rule.branch, fareBranch) && !reflect.DeepEqual(reverseStrings(rule.branch), fareBranch) {
				t.Fatalf("branch %d differs from fare deduction: %v, %v", i, rule.branch, deductions[i])
			}
		}
		endpoint := rule.branch[len(rule.branch)-1]
		if !shinkansenPairs[stationPair(endpoint, rule.shinkansenNeighbor)] {
			t.Fatalf("branch %d has no shinkansen edge between %s and %s", i, endpoint, rule.shinkansenNeighbor)
		}
		conventionalEndpoint := rule.branch[0]
		for _, neighbor := range rule.conventionalNeighbors {
			if !physicalPairs[stationPair(conventionalEndpoint, neighbor)] {
				t.Fatalf("branch %d has no conventional edge between %s and %s", i, conventionalEndpoint, neighbor)
			}
		}
	}
}

func TestGetSplitViaUsesPhysicalEdge(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	tokyo, _ := g.GetID("東京")
	kanda, _ := g.GetID("神田")
	if got := GetSplitVia(g, []int{tokyo, kanda}); !reflect.DeepEqual(got, []string{"東北"}) {
		t.Fatalf("GetSplitVia() = %v, want [東北]", got)
	}
	if got := GetSplitVia(g, []int{kanda, tokyo}); !reflect.DeepEqual(got, []string{"東北"}) {
		t.Fatalf("GetSplitVia(reverse) = %v, want [東北]", got)
	}
	for _, tc := range []struct {
		stations []string
		want     []string
	}{
		{[]string{"天満", "桜ノ宮", "京橋", "大阪城公園"}, []string{"大阪環状", "京橋"}},
		{[]string{"野田", "西九条", "弁天町"}, []string{"大阪環状", "西九条"}},
	} {
		path := make([]int, len(tc.stations))
		for i, name := range tc.stations {
			var ok bool
			path[i], ok = g.GetID(name)
			if !ok {
				t.Fatalf("station %s not found", name)
			}
		}
		if got := GetSplitVia(g, path); !reflect.DeepEqual(got, tc.want) {
			t.Fatalf("GetSplitVia(%v) = %v, want %v", tc.stations, got, tc.want)
		}
	}
}

func TestRule69ViaReplacements(t *testing.T) {
	rules := NewRule69Corrector().rules
	for _, tt := range []struct {
		name    string
		index   int
		reverse bool
		want    []string
	}{
		{"大沼経由は省略", 0, false, []string{}},
		{"尾久経由は省略", 1, false, []string{}},
		{"埼京線経由は省略", 2, false, []string{}},
		{"品鶴線経由は省略", 3, false, []string{}},
		{"総武・外房", 4, false, []string{"総武", "外房"}},
		{"外房・総武", 4, true, []string{"外房", "総武"}},
		{"米原経由は省略", 5, false, []string{}},
		{"大阪環状", 6, false, []string{"大阪環状"}},
		{"呉線経由は省略", 7, false, []string{}},
		{"柳井経由は省略", 8, false, []string{}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			stations := append([]string(nil), rules[tt.index].from...)
			if tt.reverse {
				stations = reverseStrings(stations)
			}
			g := graph.NewGraph(len(stations))
			ids := make([]int, len(stations))
			steps := make([]ViaStep, len(stations))
			for i, name := range stations {
				ids[i] = g.GetOrAddID(name)
				steps[i] = ViaStep{StationName: name, LineName: "トウカ"}
			}
			steps[len(steps)-1].LineName = ""
			if got := GetFareViaForResultWithSections(steps, ids, g, nil); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("fare via = %v, want %v", got, tt.want)
			}
			printNames := rules[tt.index].to
			if tt.reverse {
				printNames = reverseStrings(printNames)
			}
			printPath := make([]int, len(printNames))
			for i, name := range printNames {
				printPath[i] = g.GetOrAddID(name)
			}
			if got := GetSplitViaForResult(g, ids, printPath); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("split via = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestArticle70ViaKeepsTripWithinBoldArea(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	tokyo, _ := g.GetID("東京")
	kanda, _ := g.GetID("神田")
	path := []int{tokyo, kanda}
	if got := GetSplitViaForResult(g, path, path); !reflect.DeepEqual(got, []string{"東北"}) {
		t.Fatalf("split via = %v, want [東北]", got)
	}
	steps := []ViaStep{{"東京", "トウホ"}, {"神田", ""}}
	if got := GetFareViaForResultWithSections(steps, path, g, nil); !reflect.DeepEqual(got, []string{"東北"}) {
		t.Fatalf("fare via = %v, want [東北]", got)
	}
	if got := GetFareViaForResult(steps, path, g, nil); !reflect.DeepEqual(got, []string{"東北"}) {
		t.Fatalf("uncorrect via = %v, want [東北]", got)
	}
}

func TestArticle70ViaPrintsShinkansenConnectionAtEntry(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct {
		name  string
		steps []ViaStep
		want  []string
	}{
		{
			name: "上野から70条区間へ入る",
			steps: []ViaStep{
				{"三島", "シンカ"}, {"東京", "トホシ"}, {"上野", "トウホ"},
				{"鶯谷", "トウホ"}, {"日暮里", "シヨハ"}, {"三河島", ""},
			},
			want: []string{"三島", "新幹線", "東京", "新幹線", "上野", "三河島"},
		},
		{
			name: "70条区間から上野へ出る",
			steps: []ViaStep{
				{"三河島", "シヨハ"}, {"日暮里", "トウホ"}, {"鶯谷", "トウホ"},
				{"上野", "トホシ"}, {"東京", "シンカ"}, {"三島", ""},
			},
			want: []string{"三河島", "上野", "新幹線", "東京", "新幹線", "三島"},
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			path := make([]int, len(tt.steps))
			for i, step := range tt.steps {
				id, ok := g.GetID(step.StationName)
				if !ok {
					t.Fatalf("station %q is missing", step.StationName)
				}
				path[i] = id
			}
			if got := GetFareViaForResultWithSections(tt.steps, path, g, nil); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("fare via = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestArticle70ViaEndpointUsesRouteAndPrintingKana(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	loadViaData()
	key := stationPair("神田", "東京")
	previous, hadPrevious := viaData.article70Kana[key]
	customKana := "チユト"
	viaData.article70Kana[key] = &customKana
	defer func() {
		if hadPrevious {
			viaData.article70Kana[key] = previous
		} else {
			delete(viaData.article70Kana, key)
		}
	}()
	for _, stations := range [][]string{
		{"神田", "東京", "名古屋"},
		{"名古屋", "東京", "神田"},
	} {
		path := make([]int, len(stations))
		steps := make([]ViaStep, len(stations))
		for i, name := range stations {
			path[i], _ = g.GetID(name)
			steps[i] = ViaStep{StationName: name, LineName: "シンカ"}
		}
		steps[len(steps)-1].LineName = ""
		if got := GetSplitViaForResult(g, path, path); !reflect.DeepEqual(got, []string{"中央東"}) {
			t.Fatalf("GetSplitViaForResult(%v) = %v, want [中央東]", stations, got)
		}
		got := GetFareViaForResultWithSections(steps, path, g, nil)
		count := 0
		for _, printed := range got {
			if printed == "中央東" {
				count++
			}
		}
		if count != 1 {
			t.Fatalf("GetFareViaForResultWithSections(%v) = %v, want 中央東 once", stations, got)
		}
	}
}

func TestArticle70KanaTokyoKandaOchanomizu(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	ids := func(names ...string) []int {
		path := make([]int, len(names))
		for i, name := range names {
			path[i], _ = g.GetID(name)
		}
		return path
	}
	inside := ids("東京", "神田", "御茶ノ水")
	wantOrdinary := []string{"東北", "中央東"}
	if got := GetSplitVia(g, inside); !reflect.DeepEqual(got, wantOrdinary) {
		t.Fatalf("ordinary split via = %v, want %v", got, wantOrdinary)
	}
	if got := GetSplitViaForResult(g, inside, inside); !reflect.DeepEqual(got, wantOrdinary) {
		t.Fatalf("inside article70 via = %v, want %v", got, wantOrdinary)
	}
	steps := []ViaStep{{"東京", "トウホ"}, {"神田", "チユト"}, {"御茶ノ水", ""}}
	if got := GetFareVia(steps); !reflect.DeepEqual(got, wantOrdinary) {
		t.Fatalf("ordinary fare via = %v, want %v", got, wantOrdinary)
	}
	for _, names := range [][]string{{"八丁堀", "東京", "神田"}, {"神田", "東京", "八丁堀"}} {
		path := ids(names...)
		steps := []ViaStep{{names[0], "ケイヨ"}, {names[1], "トウホ"}, {names[2], ""}}
		want := []string{"京葉", "東北"}
		if names[0] == "神田" {
			steps[0].LineName, steps[1].LineName = "トウホ", "ケイヨ"
			want = []string{"東北", "京葉"}
		}
		if got := GetFareViaForResultWithSections(steps, path, g, nil); !reflect.DeepEqual(got, want) {
			t.Fatalf("fare via %v = %v, want %v", names, got, want)
		}
		if got := GetSplitViaForResult(g, path, path); !reflect.DeepEqual(got, want) {
			t.Fatalf("split via %v = %v, want %v", names, got, want)
		}
	}

	outside := ids("名古屋", "東京", "神田")
	if got := GetSplitViaForResult(g, outside, outside); !reflect.DeepEqual(got, []string{"東北"}) {
		t.Fatalf("Tokyo boundary article70 kana via = %v, want [東北]", got)
	}
	for _, names := range [][]string{
		{"名古屋", "東京", "神田", "御茶ノ水"},
		{"御茶ノ水", "神田", "東京", "名古屋"},
	} {
		path := ids(names...)
		want := []string{"東北", "中央東"}
		if names[0] == "御茶ノ水" {
			want = []string{"中央東", "東北"}
		}
		if got := GetSplitViaForResult(g, path, path); !reflect.DeepEqual(got, want) {
			t.Fatalf("article70 kana via %v = %v, want %v", names, got, want)
		}
	}
}

func TestRule69ViaKeepsOutsideLinesAndChecksNeighbors(t *testing.T) {
	branch := NewRule69Corrector().rules[6].from
	for _, tt := range []struct {
		before string
		want   []string
	}{
		{"新大阪", []string{"東海道", "大阪環状", "東海道"}},
		{"東京", []string{"東海道"}},
	} {
		t.Run(tt.before, func(t *testing.T) {
			stations := append([]string{tt.before}, branch...)
			stations = append(stations, "東部市場前")
			g := graph.NewGraph(len(stations))
			ids := make([]int, len(stations))
			steps := make([]ViaStep, len(stations))
			for i, name := range stations {
				ids[i] = g.GetOrAddID(name)
				steps[i] = ViaStep{StationName: name, LineName: "トウカ"}
			}
			steps[len(steps)-1].LineName = ""
			if got := GetFareViaForResultWithSections(steps, ids, g, nil); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("fare via = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestRule69ViaDoesNotRepeatSameKanaAroundOmittedSection(t *testing.T) {
	branch := NewRule69Corrector().rules[0].from
	stations := append([]string{"新函館北斗"}, branch...)
	stations = append(stations, "石倉")
	g := graph.NewGraph(len(stations))
	ids := make([]int, len(stations))
	steps := make([]ViaStep, len(stations))
	for i, name := range stations {
		ids[i] = g.GetOrAddID(name)
		steps[i] = ViaStep{StationName: name, LineName: "トウカ"}
	}
	steps[len(steps)-1].LineName = ""
	want := []string{"東海道"}
	if got := GetFareViaForResultWithSections(steps, ids, g, nil); !reflect.DeepEqual(got, want) {
		t.Fatalf("fare via = %v, want %v", got, want)
	}
}

func TestRule69SplitViaDoesNotRepeatSameKanaAroundOmittedSection(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	ids := func(names []string) []int {
		path := make([]int, len(names))
		for i, name := range names {
			id, ok := g.GetID(name)
			if !ok {
				t.Fatalf("station %q is missing", name)
			}
			path[i] = id
		}
		return path
	}
	rule := NewRule69Corrector().rules[0]
	source := append([]string{"新函館北斗"}, rule.from...)
	source = append(source, "石倉")
	printed := append([]string{"新函館北斗"}, rule.to...)
	printed = append(printed, "石倉")
	want := []string{"函館線"}
	if got := GetSplitViaForResult(g, ids(source), ids(printed)); !reflect.DeepEqual(got, want) {
		t.Fatalf("split via = %v, want %v", got, want)
	}
}

func TestRule69ViaDoesNotRepeatAdjacentReplacementLine(t *testing.T) {
	branch := reverseStrings(NewRule69Corrector().rules[4].from)
	stations := append([]string{"鎌取"}, branch...)
	stations = append(stations, "品川")
	g := graph.NewGraph(len(stations))
	ids := make([]int, len(stations))
	steps := make([]ViaStep, len(stations))
	for i, name := range stations {
		ids[i] = g.GetOrAddID(name)
		steps[i] = ViaStep{StationName: name, LineName: "トウカ"}
	}
	steps[0].LineName = "ソトホ"
	steps[len(steps)-2].LineName = "ソウフ"
	steps[len(steps)-1].LineName = ""
	want := []string{"外房", "総武"}
	if got := GetFareViaForResultWithSections(steps, ids, g, nil); !reflect.DeepEqual(got, want) {
		t.Fatalf("fare via = %v, want %v", got, want)
	}
}

func TestPrivateConnectionCodesPreservePrinting(t *testing.T) {
	for _, tt := range []struct {
		name           string
		path           []ViaStep
		codes, printed []string
	}{
		{"メトロ東西通過", []ViaStep{{"三鷹", "チユト"}, {"中野", "メトロ東西"}, {"西船橋", "ソウフ"}, {"津田沼", ""}}, []string{"チユト", "4608", "4614", "ソウフ"}, []string{"中央東", "中野", "西船橋", "総武"}},
		{"私鉄同士の接続", []ViaStep{{"和倉温泉", "ナナオ"}, {"津幡", "いしかわ"}, {"倶利伽羅", "とやま鉄道"}, {"高岡", "シヨウ"}, {"新高岡", ""}}, []string{"ナナオ", "6202", "6203", "6204", "6205", "シヨウ"}, []string{"七尾線", "津幡", "ＩＲいしかわ", "倶利伽羅", "あいの風とやま", "高岡", "城端線"}},
		{"接続可能駅を通過する私鉄発着", []ViaStep{{"六日町", "ほくほく線"}, {"十日町", "ほくほく線"}, {"犀潟", ""}}, []string{"3711", "3713"}, []string{"ほくほく線"}},
		{"コードのない私鉄内の発着駅", []ViaStep{{"伊勢中川", "近鉄線"}, {"松阪", ""}}, []string{"6542"}, []string{"近鉄線"}},
		{"新幹線と私鉄", []ViaStep{{"岡山", "シンカ"}, {"博多", "地下鉄空港"}, {"姪浜", ""}}, []string{"オカオカＢ", "シンカ", "モシハカＢ", "9508", "9509"}, []string{"岡山", "新幹線", "博多", "福岡市高速鉄"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			for _, reverse := range []bool{false, true} {
				path, codes, printed := tt.path, tt.codes, tt.printed
				if reverse {
					path = make([]ViaStep, len(tt.path))
					for i := range path {
						path[i].StationName = tt.path[len(path)-1-i].StationName
						if i+1 < len(path) {
							path[i].LineName = tt.path[len(path)-2-i].LineName
						}
					}
					codes, printed = reverseStrings(codes), reverseStrings(printed)
				}
				if got := inputViaKanas(path); !reflect.DeepEqual(got, codes) {
					t.Fatalf("codes (reverse=%v) = %v, want %v", reverse, got, codes)
				}
				if got := getFareVia(path, true, true, nil); !reflect.DeepEqual(got, printed) {
					t.Fatalf("printing (reverse=%v) = %v, want %v", reverse, got, printed)
				}
			}
		})
	}
}

func TestPrivateConnectionCodesIgnoreSameCompanyLineChange(t *testing.T) {
	// 路線切替判定だけの入力。実際の乗車経路の探索は行わない。
	path := []ViaStep{{"中野", "メトロ東西"}, {"西日暮里", "メトロ千代"}, {"北千住", ""}}
	want := []string{"4608", "4617"}
	if got := inputViaKanas(path); !reflect.DeepEqual(got, want) {
		t.Fatalf("same-company connection codes = %v, want %v", got, want)
	}
	// コード生成の変更で既存の路線・駅名印字は変えない。
	printed := []string{"西日暮里", "千代田線"}
	if got := getFareVia(path, true, true, nil); !reflect.DeepEqual(got, printed) {
		t.Fatalf("same-company printing = %v, want %v", got, printed)
	}
}

func TestAutomaticViaKanasUsesAutomaticRulesBeforeOmission(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	for _, tt := range []struct{ names, want []string }{
		{[]string{"東京", "神田", "秋葉原", "御徒町", "上野", "鶯谷", "日暮里", "三河島", "南千住", "北千住"}, []string{"トウホ", "シヨハ"}},
		{[]string{"八丁堀", "東京", "神田"}, []string{"ケイヨ", "トウホ"}},
	} {
		path := make([]int, len(tt.names))
		for i, name := range tt.names {
			path[i], _ = g.GetID(name)
		}
		if got := automaticViaKanas(g, path); !reflect.DeepEqual(got, tt.want) {
			t.Fatalf("%v codes=%v want=%v", tt.names, got, tt.want)
		}
	}
}

func TestShinOsakaShinkansenKana(t *testing.T) {
	loadViaData()
	for _, tt := range []struct {
		path []ViaStep
		want []string
	}{
		{[]ViaStep{{"新大阪", "シンカ"}, {"新神戸", "シンカ"}, {"西明石", "シンカ"}, {"姫路", ""}}, []string{"オサシオＢ", "シンカ", "オサヒメＢ"}},
		{[]ViaStep{{"姫路", "シンカ"}, {"西明石", "シンカ"}, {"新神戸", "シンカ"}, {"新大阪", ""}}, []string{"オサヒメＢ", "シンカ", "オサシオＢ"}},
		{[]ViaStep{{"大阪", "トウカ"}, {"新大阪", ""}}, []string{"トウカ"}},
	} {
		if got := viaKanas(tt.path, nil); !reflect.DeepEqual(got, tt.want) {
			t.Fatalf("codes=%v want=%v", got, tt.want)
		}
	}
}

func TestNishiUrakamiKikitsuVia(t *testing.T) {
	g, err := (&graphio.JSONLoader{}).Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	names := []string{"西浦上", "道ノ尾", "（長）高田", "長与", "本川内", "大草", "東園", "喜々津"}
	for _, reverse := range []bool{false, true} {
		ordered := append([]string(nil), names...)
		if reverse {
			for i, j := 0, len(ordered)-1; i < j; i, j = i+1, j-1 {
				ordered[i], ordered[j] = ordered[j], ordered[i]
			}
		}
		path := make([]int, len(ordered))
		steps := make([]ViaStep, len(ordered))
		for i, n := range ordered {
			path[i], _ = g.GetID(n)
			steps[i] = ViaStep{StationName: n}
			if i < len(ordered)-1 {
				steps[i].LineName = "ナカサ２"
			}
		}
		want := []string{"西浦上", "長崎線"}

		if reverse {
			want = []string{"長崎線", "西浦上"}
		}
		if got := GetFareViaForResultWithSections(steps, path, g, nil); !reflect.DeepEqual(got, want) {
			t.Fatalf("fare=%v want=%v", got, want)
		}
		if got := GetAutomaticFareViaForResult(g, path, path); !reflect.DeepEqual(got, want) {
			t.Fatalf("auto=%v want=%v", got, want)
		}
	}
}
