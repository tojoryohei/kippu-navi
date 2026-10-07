package ticket_test

import (
	"calculation-engine/internal/split"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"encoding/json"
	"io"
	"os"
	"reflect"
	"slices"
	"strings"
	"testing"
)

func TestCheapestThroughDedicatedStations(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	corrector := usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector())
	calculator := usecase.NewRouteTicketCalculator(g, corrector, evaluator, nil, zones)
	for _, tc := range []struct {
		names []string
		line  string
		want  []string
		codes []string
	}{
		{[]string{"熱海", "三島", "（東）新富士", "静岡", "掛川", "浜松", "豊橋", "三河安城", "名古屋", "岐阜羽島", "米原", "京都", "新大阪", "新神戸", "西明石", "姫路", "相生", "岡山", "新倉敷", "福山", "新尾道", "三原", "東広島", "広島", "新岩国", "徳山", "新山口", "厚狭", "新下関"}, "シンカ", []string{"東海道", "山陽", "岩徳線", "山陽"}, []string{"トウカ", "サンヨ", "カント", "サンヨ"}},
		{[]string{"博多", "新鳥栖", "久留米", "筑後船小屋", "新大牟田", "新玉名", "熊本", "新八代"}, "キユシ", []string{"鹿児島線"}, []string{"カコシ"}},
		{[]string{"東京", "上野", "大宮", "小山", "宇都宮", "那須塩原", "新白河", "（北）郡山", "（北）福島", "白石蔵王", "仙台", "古川", "くりこま高原", "一ノ関", "水沢江刺", "北上", "新花巻", "盛岡", "いわて沼宮内", "二戸", "八戸", "七戸十和田", "新青森"}, "トホシ", []string{"東北", "一ノ関", "新幹線", "北上", "東北", "盛岡", "新幹線", "新青森"}, []string{"トウホ", "モリイチＢ", "トホシ", "モリカミＢ", "トウホ", "モリモリＢ", "トホシ", "アキシアＢ"}},
	} {
		for _, reverse := range []bool{false, true} {
			names := slices.Clone(tc.names)
			want := slices.Clone(tc.want)
			codes := slices.Clone(tc.codes)
			if reverse {
				slices.Reverse(names)
				slices.Reverse(want)
				slices.Reverse(codes)
			}
			t.Run(names[0]+"→"+names[len(names)-1], func(t *testing.T) {
				steps := make([]usecase.ViaStep, len(names))
				for i, name := range names {
					steps[i].StationName = name
					if i+1 < len(names) {
						steps[i].LineName = tc.line
					}
				}
				path, err := calculator.ResolvePath(steps)
				if err != nil {
					t.Fatal(err)
				}
				var fare usecase.RouteTicketFare
				logged := captureCheapestViaLog(t, func() {
					fare, _, err = calculator.Calculate(path, steps, "cheapest")
				})
				if err != nil {
					t.Fatal(err)
				}
				encoded, marshalErr := json.Marshal(codes)
				if marshalErr != nil {
					t.Fatal(marshalErr)
				}
				if logged != "カナコード："+string(encoded)+"\n" {
					t.Fatalf("log = %q, want codes %v", logged, codes)
				}
				if !reflect.DeepEqual(fare.PrintedViaLines, want) {
					t.Fatalf("got %v want %v", fare.PrintedViaLines, want)
				}
			})
		}
	}
}

func captureCheapestViaLog(t *testing.T, run func()) string {
	t.Helper()
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reader.Close() }()
	original := os.Stdout
	os.Stdout = writer
	defer func() { os.Stdout = original; _ = writer.Close() }()
	var output strings.Builder
	done := make(chan error, 1)
	go func() { _, err := io.Copy(&output, reader); done <- err }()
	run()
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	os.Stdout = original
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	return output.String()
}

func TestCheapestThroughReplacementDuplicate(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	corrector := usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector())
	calculator := usecase.NewRouteTicketCalculator(g, corrector, evaluator, nil, zones)
	for _, tc := range []struct {
		names                        []string
		code, conventional           string
		want                         []string
		retained, excluded, replaced string
	}{
		{[]string{"三島", "（東）新富士", "静岡", "東静岡"}, "シンカ", "トウカ", []string{"三島", "新幹線", "静岡", "東海道"}, "（東）新富士", "富士", ""},
		{[]string{"一ノ関", "くりこま高原", "古川", "仙台", "白石蔵王", "（北）福島", "東福島"}, "トホシ", "トウホ", []string{"東北", "仙台", "新幹線", "（北）福島", "東北"}, "白石蔵王", "白石", "鹿島台"},
	} {
		for _, reverse := range []bool{false, true} {
			names, want := slices.Clone(tc.names), slices.Clone(tc.want)
			lines := make([]string, len(names)-1)
			for i := range lines {
				lines[i] = tc.code
			}
			lines[len(lines)-1] = tc.conventional
			if reverse {
				slices.Reverse(names)
				slices.Reverse(lines)
				slices.Reverse(want)
			}
			t.Run(strings.Join(names, "→"), func(t *testing.T) {
				steps := make([]usecase.ViaStep, len(names))
				for i, name := range names {
					steps[i].StationName = name
					if i < len(lines) {
						steps[i].LineName = lines[i]
					}
				}
				path, err := calculator.ResolvePath(steps)
				if err != nil {
					t.Fatal(err)
				}
				var fare usecase.RouteTicketFare
				logged := captureCheapestViaLog(t, func() { fare, _, err = calculator.Calculate(path, steps, "cheapest") })
				if err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(fare.PrintedViaLines, want) {
					t.Fatalf("via = %v, want %v", fare.PrintedViaLines, want)
				}
				if strings.Count(logged, `"`+tc.code+`"`) != 1 {
					t.Fatalf("新幹線コードが保持されていません: %s", logged)
				}
				details, err := calculator.SplitCandidateDetails(steps, "cheapest")
				if err != nil {
					t.Fatal(err)
				}
				if !slices.Contains(details.Names, tc.retained) || slices.Contains(details.Names, tc.excluded) {
					t.Fatalf("候補駅: %v", details.Names)
				}
				if tc.replaced != "" && !slices.Contains(details.Names, tc.replaced) {
					t.Fatalf("独立した置換が失われました: %v", details.Names)
				}
				// 分割区間評価に入力の経由情報がなくても、券面経路から同じ印字を生成します。
				var result *usecase.RouteSplitResult
				logged = captureCheapestViaLog(t, func() {
					result, err = calculator.Split(steps, "cheapest", split.RouteSplitOptions{NoSplitStations: details.Names})
				})
				if err != nil {
					t.Fatal(err)
				}
				if logged != "" {
					t.Fatalf("分割計算がログを出力しました: %s", logged)
				}
				if len(result.Results) != 1 || len(result.Results[0].Segments) != 1 {
					t.Fatalf("分割禁止が適用されていません: %+v", result)
				}
				if got := result.Results[0].Segments[0].Fare.PrintedViaLines; !reflect.DeepEqual(got, want) {
					t.Fatalf("分割券の経由 = %v, want %v", got, want)
				}
			})
		}
	}
}
