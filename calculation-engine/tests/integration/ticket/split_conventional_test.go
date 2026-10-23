package ticket_test

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/split"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"encoding/json"
	"fmt"
	"os"
	"slices"
	"testing"
)

func TestSplitConventionalCorridors(t *testing.T) {
	_, g := setupTicketAmount(t)
	calculator := usecase.NewRouteTicketCalculator(g, usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector()), nil, nil, nil)
	cases := []struct {
		code               string
		input              []string
		includes, excludes string
	}{
		{"シンカ", []string{"三島", "（東）新富士", "静岡"}, "富士", "（東）新富士"},
		{"シンカ", []string{"名古屋", "岐阜羽島", "米原"}, "岐阜", "岐阜羽島"},
		{"シンカ", []string{"新大阪", "新神戸", "西明石"}, "神戸", "新神戸"},
		{"シンカ", []string{"広島", "新岩国", "徳山"}, "玖珂", "柳井"},
		{"トホシ", []string{"（北）福島", "白石蔵王", "仙台"}, "（北）白石", "白石蔵王"},
		{"シヨシ", []string{"高崎", "上毛高原", "越後湯沢"}, "水上", "上毛高原"},
		{"シヨシ", []string{"長岡", "燕三条", "新潟"}, "東三条", "燕三条"},
		{"キユシ", []string{"博多", "新鳥栖", "久留米"}, "鳥栖", "新鳥栖"},
		{"キユシ", []string{"（鹿）川内", "鹿児島中央"}, "伊集院", ""},
		{"ニキシ", []string{"諫早", "長崎"}, "現川", ""},
	}
	for _, tc := range cases {
		for _, reverse := range []bool{false, true} {
			input := append([]string(nil), tc.input...)
			if reverse {
				slices.Reverse(input)
			}
			steps := make([]usecase.ViaStep, len(input))
			for i, name := range input {
				steps[i] = usecase.ViaStep{StationName: name, LineName: tc.code}
			}
			got, err := calculator.SplitCandidateDetails(steps, "cheapest")
			if err != nil {
				t.Fatalf("%v: %v", input, err)
			}
			if !slices.Contains(got.Names, tc.includes) || tc.excludes != "" && slices.Contains(got.Names, tc.excludes) {
				t.Fatalf("%v => %v", input, got)
			}
			if len(got.Replacements) == 0 {
				t.Fatal("置き換え区間の詳細がありません")
			}
			for _, mode := range []string{"normal", "uncorrect"} {
				p, err := calculator.PrepareSplitPath(steps, mode)
				if err != nil || len(p) != len(input) {
					t.Fatalf("モード%sで経路が変化しました: %v %v", mode, p, err)
				}
			}
		}
	}
}

func TestSplitConventionalPartialAndDuplicate(t *testing.T) {
	_, g := setupTicketAmount(t)
	calculator := usecase.NewRouteTicketCalculator(g, usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector()), nil, nil, nil)
	steps := []usecase.ViaStep{{StationName: "（東）新富士", LineName: "シンカ"}, {StationName: "静岡", LineName: "シンカ"}, {StationName: "掛川"}}
	path, err := calculator.PrepareSplitPath(steps, "cheapest")
	if err != nil {
		t.Fatal(err)
	}
	if g.GetName(path[0]) != "（東）新富士" || g.GetName(path[1]) != "静岡" || len(path) <= 3 {
		t.Fatal("新幹線単独駅の端点が失われました")
	}
	names := []string{"富士", "吉原", "東田子の浦", "原", "片浜", "沼津", "三島", "（東）新富士", "静岡", "掛川"}
	steps = make([]usecase.ViaStep, len(names))
	for i, name := range names {
		line := "トウカ"
		if i >= 6 {
			line = "シンカ"
		}
		steps[i] = usecase.ViaStep{StationName: name, LineName: line}
	}
	details, err := calculator.SplitCandidateDetails(steps, "cheapest")
	if err != nil {
		t.Fatal(err)
	}
	if len(details.Replacements) != 2 || details.Replacements[0].Status != "retained_duplicate" || details.Replacements[1].Status != "replaced" {
		t.Fatalf("重複区間の復元結果が不正です: %+v", details)
	}
	path, err = calculator.PrepareSplitPath(steps, "cheapest")
	if err != nil || domain.HasDuplicateStation(path) {
		t.Fatalf("重複する駅が残っています: %v", err)
	}
	if !slices.Contains(details.Names, "（東）新富士") || !slices.Contains(details.Names, "焼津") {
		t.Fatal("重複区間の復元と独立した区間の置き換えを両立する必要があります")
	}
	for _, input := range [][]string{{"新下関", "小倉"}, {"小倉", "博多"}, {"新八代", "新水俣", "出水", "（鹿）川内"}, {"高崎", "安中榛名", "軽井沢"}, {"東京", "品川", "新横浜", "小田原", "熱海"}} {
		code := "シンカ"
		if input[0] == "新八代" {
			code = "キユシ"
		}
		if input[0] == "高崎" {
			code = "ホクシ"
		}
		steps = make([]usecase.ViaStep, len(input))
		for i, name := range input {
			steps[i] = usecase.ViaStep{StationName: name, LineName: code}
		}
		path, err = calculator.PrepareSplitPath(steps, "cheapest")
		if err != nil || len(path) != len(input) {
			t.Fatalf("置き換え対象外の区間が変化しました: %v %v", input, err)
		}
	}
}

func TestSplitConventionalEnumeration(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), nil, zones, g)
	calculator := usecase.NewRouteTicketCalculator(g, usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector()), evaluator, nil, zones)
	steps := []usecase.ViaStep{{StationName: "諫早", LineName: "ニキシ"}, {StationName: "長崎"}}
	target, err := calculator.PrepareSplitPath(steps, "cheapest")
	if err != nil {
		t.Fatal(err)
	}
	got, err := calculator.Split(steps, "cheapest", split.RouteSplitOptions{MaxSplits: 2, NoSplitStations: []string{"現川"}})
	if err != nil {
		t.Fatal(err)
	}
	best := int(^uint(0) >> 1)
	want := []string{}
	for mask := 0; mask < 1<<(len(target)-2); mask++ {
		cuts := []int{0}
		for j := 1; j < len(target)-1; j++ {
			if mask&(1<<(j-1)) != 0 {
				cuts = append(cuts, j)
			}
		}
		cuts = append(cuts, len(target)-1)
		if len(cuts) > 4 {
			continue
		}
		valid := true
		total := 0
		names := []string{}
		for k := 1; k < len(cuts); k++ {
			if k < len(cuts)-1 && g.GetName(target[cuts[k]]) == "現川" {
				valid = false
				break
			}
			fare, _, err := calculator.Calculate(target[cuts[k-1]:cuts[k]+1], nil, "cheapest")
			if err != nil {
				t.Fatal(err)
			}
			total += fare.Fare
			names = append(names, g.GetName(target[cuts[k]]))
		}
		if !valid {
			continue
		}
		if total < best {
			best = total
			want = nil
		}
		if total == best {
			want = append(want, fmt.Sprint(names))
		}
	}
	actual := []string{}
	for _, plan := range got.Results {
		if plan.TotalFare != best {
			t.Fatalf("運賃%dが期待値%dと一致しません", plan.TotalFare, best)
		}
		names := []string{}
		for _, segment := range plan.Segments {
			names = append(names, segment.ArrivalStation)
		}
		actual = append(actual, fmt.Sprint(names))
	}
	slices.Sort(actual)
	slices.Sort(want)
	if !slices.Equal(actual, want) {
		t.Fatalf("パターン: %v != %v", actual, want)
	}
}

func BenchmarkSplitConventionalLongRoute(t *testing.B) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), nil, zones, g)
	calculator := usecase.NewRouteTicketCalculator(g, usecase.NewPipelineCorrector(usecase.NewShinkansenOverlapCorrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector()), evaluator, nil, zones)
	data, err := os.ReadFile("../../../internal/ticket/usecase/split_conventional_routes.json")
	if err != nil {
		t.Fatal(err)
	}
	var rules []struct{ Shinkansen []string }
	if err = json.Unmarshal(data, &rules); err != nil {
		t.Fatal(err)
	}
	// 置換対象の終端は新下関。WASM回帰ケースと同じく小倉まで計算する。
	names := append(slices.Clone(rules[0].Shinkansen), "小倉")
	steps := make([]usecase.ViaStep, len(names))
	for i, name := range names {
		steps[i] = usecase.ViaStep{StationName: name, LineName: "シンカ"}
	}
	t.ReportAllocs()
	t.ResetTimer()
	for t.Loop() {
		result, err := calculator.Split(steps, "cheapest")
		if err != nil {
			t.Fatal(err)
		}
		if len(result.Results) == 0 {
			t.Fatal("計算結果がありません")
		}
	}
}
