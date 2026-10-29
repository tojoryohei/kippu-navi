package usecase

import (
	"calculation-engine/internal/ticket/graph"
	"reflect"
	"slices"
	"testing"
)

type mockGraphCorrector struct {
	graph.Graph
	names map[int]string
}

func (m *mockGraphCorrector) GetName(id int) string {
	return m.names[id]
}

func (m *mockGraphCorrector) GetID(name string) (int, bool) {
	for k, v := range m.names {
		if v == name {
			return k, true
		}
	}
	return -1, false
}

func TestShinkansenOverlapCorrector(t *testing.T) {
	g := &mockGraphCorrector{
		names: map[int]string{
			1:  "姫路",
			2:  "手柄山平和公園",
			3:  "英賀保",
			4:  "はりま勝原",
			5:  "網干",
			6:  "竜野",
			7:  "相生",
			8:  "御茶ノ水",
			9:  "神田",
			10: "東京",
			11: "秋葉原",
		},
	}

	c := NewShinkansenOverlapCorrector()

	tests := []struct {
		name     string
		input    []int
		expected []int
	}{
		{
			name:     "折り返しのない新幹線を保持（順方向）",
			input:    []int{1, 7}, // 姫路 -> 相生
			expected: []int{1, 7},
		},
		{
			name:     "折り返しのない新幹線を保持（逆方向）",
			input:    []int{7, 1}, // 相生 -> 姫路
			expected: []int{7, 1},
		},
		{
			name:     "展開が不要な経路",
			input:    []int{1, 2, 3},
			expected: []int{1, 2, 3},
		},
		{
			name: "重複の控除（条件を満たす）",
			// 御茶ノ水(8) -> 神田(9) -> 東京(10) -> 神田(9) -> 秋葉原(11)
			input:    []int{8, 9, 10, 9, 11},
			expected: []int{8, 9, 11}, // 神田〜東京の重複が削られる (神田は分岐駅なので残る)
		},
		{
			name: "重複の控除（条件を満たさない：前後が同じ駅）",
			// 御茶ノ水(8) -> 神田(9) -> 東京(10) -> 神田(9) -> 御茶ノ水(8)
			input:    []int{8, 9, 10, 9, 8},
			expected: []int{8, 9, 10, 9, 8}, // 置換されない
		},
		{
			name: "重複の控除（条件を満たさない：パターンの端が始発駅）",
			// 神田(9) -> 東京(10) -> 神田(9) -> 秋葉原(11)
			input:    []int{9, 10, 9, 11},
			expected: []int{9, 10, 9, 11}, // 置換されない
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := c.Correct(tt.input, g)
			if err != nil {
				t.Fatalf("予期しないエラーが発生しました: %v", err)
			}
			if !reflect.DeepEqual(res, tt.expected) {
				t.Errorf("実際 %v, 期待値 %v", res, tt.expected)
			}
		})
	}
}

type fixedPathCorrector struct {
	path []int
}

func (c fixedPathCorrector) Correct(_ []int, _ graph.Graph) ([]int, error) {
	return append([]int(nil), c.path...), nil
}

func TestPipelineCorrectorCapturesPathBeforeShinkansenExpansion(t *testing.T) {
	g := &mockGraphCorrector{
		names: map[int]string{
			1: "姫路",
			2: "手柄山平和公園",
			3: "英賀保",
			4: "はりま勝原",
			5: "網干",
			6: "竜野",
			7: "相生",
		},
	}
	pipeline := NewPipelineCorrector(
		fixedPathCorrector{path: []int{1, 7}},
		NewShinkansenOverlapCorrector(),
	)

	corrected, before, err := pipeline.CorrectWithPreShinkansenPath([]int{99}, g)
	if err != nil {
		t.Fatalf("予期しないエラーが発生しました: %v", err)
	}
	if want := []int{1, 7}; !reflect.DeepEqual(corrected, want) {
		t.Fatalf("補正後の経路 = %v, 期待値 %v", corrected, want)
	}
	if want := []int{1, 7}; !reflect.DeepEqual(before, want) {
		t.Fatalf("新幹線補正前の経路 = %v, 期待値 %v", before, want)
	}
}

func TestRule157ShinOsakaDirections(t *testing.T) {
	for _, tt := range []struct {
		before, after string
		match         bool
	}{
		{"", "姫路", false},
		{"東淀川", "姫路", false},
		{"南吹田", "（陽）大久保", false},
		{"京都", "姫路", false},
		{"東淀川", "", false},
		{"塚本", "姫路", false},
		{"南吹田", "明石", false},
	} {
		for _, reverse := range []bool{false, true} {
			names := []string{"新大阪", "新神戸", "西明石"}
			if tt.before != "" {
				names = append([]string{tt.before}, names...)
			}
			if tt.after != "" {
				names = append(names, tt.after)
			}
			if reverse {
				names = reverseStrings(names)
			}
			g := graph.NewGraph(40)
			corrector := NewRule157Corrector()
			for _, rule := range corrector.rules {
				for _, name := range rule.to {
					g.GetOrAddID(name)
				}
			}
			path := make([]int, len(names))
			for i, name := range names {
				path[i] = g.GetOrAddID(name)
			}
			corrected, err := corrector.Correct(path, g)
			if err != nil {
				t.Fatal(err)
			}
			if changed := !reflect.DeepEqual(path, corrected); changed != tt.match {
				t.Errorf("経路=%v: 補正後=%v, 一致判定の期待値=%v", names, corrected, tt.match)
			}
			if sections := findRule157ViaSections(names); len(sections) != 0 {
				t.Errorf("経路=%v: 第27条の適用で経由表示用の区間が生成されています: %v", names, sections)
			}
		}
	}
}

func TestSpecificSectionCorrector(t *testing.T) {
	g := &mockGraphCorrector{
		names: map[int]string{
			1:   "鶯谷",
			2:   "日暮里",
			3:   "尾久",
			4:   "赤羽",
			5:   "川口",
			101: "西日暮里",
			102: "田端",
			103: "上中里",
			104: "王子",
			105: "東十条",
			6:   "大沼",
			7:   "大沼公園",
			8:   "赤井川",
			9:   "駒ケ岳",
			14:  "鹿部",
			15:  "渡島沼尻",
			16:  "渡島砂原",
			17:  "掛澗",
			18:  "尾白内",
			19:  "東森",
			20:  "森",
			21:  "新函館北斗",
			22:  "石倉",
		},
	}

	c := NewPipelineCorrector(
		NewRule69Corrector(),
		NewRule157Corrector(),
		NewRule43_2Corrector(),
	)

	tests := []struct {
		name     string
		input    []int
		expected []int
	}{
		{
			name:     "特定区間の置換が適用される（順方向）",
			input:    []int{1, 2, 3, 4, 5}, // 鶯谷 -> 日暮里 -> 尾久 -> 赤羽 -> 川口
			expected: []int{1, 2, 101, 102, 103, 104, 105, 4, 5},
		},
		{
			name:     "特定区間の置換が適用される（逆方向）",
			input:    []int{5, 4, 3, 2, 1}, // 川口 -> 赤羽 -> 尾久 -> 日暮里 -> 鶯谷
			expected: []int{5, 4, 105, 104, 103, 102, 101, 2, 1},
		},
		{
			name:     "特定区間が含まれない",
			input:    []int{1, 2, 101, 102, 4, 5},
			expected: []int{1, 2, 101, 102, 4, 5},
		},
		{
			name: "大沼〜森間の東森経由が駒ケ岳経由に置換される",
			// 新函館北斗(21) -> 大沼(6) -> (東森経由) -> 森(20) -> 石倉(22)
			input: []int{21, 6, 14, 15, 16, 17, 18, 19, 20, 22},
			// 期待値: 新函館北斗(21) -> 大沼(6) -> 大沼公園(7) -> 赤井川(8) -> 駒ケ岳(9) -> 森(20) -> 石倉(22)
			expected: []int{21, 6, 7, 8, 9, 20, 22},
		},
		{
			name: "逆方向からの進入で置換される",
			// 石倉(22) -> 森(20) -> (東森経由) -> 大沼(6) -> 新函館北斗(21)
			input:    []int{22, 20, 19, 18, 17, 16, 15, 14, 6, 21},
			expected: []int{22, 20, 9, 8, 7, 6, 21},
		},
		{
			name: "方向が一致しない場合は置換されない（大沼側）",
			// 赤井川(8) -> 大沼(6) -> (東森経由) -> 森(20) -> 石倉(22)
			input:    []int{8, 6, 14, 15, 16, 17, 18, 19, 20, 22},
			expected: []int{8, 6, 14, 15, 16, 17, 18, 19, 20, 22}, // 置換条件(大沼の隣接駅が新函館北斗)を満たさないためそのまま
		},
		{
			name: "方向が一致しない場合は置換されない（両線路またがり）",
			// 新函館北斗(21) -> 大沼(6) -> (東森経由) -> 森(20) -> (駒ケ岳経由) -> 大沼(6) -> 新函館北斗(21)
			// 森の次の駅が駒ケ岳(9)であり、石倉(22)方面ではないため「森以遠」の条件を満たさない
			input:    []int{21, 6, 14, 15, 16, 17, 18, 19, 20, 9, 8, 7, 6, 21},
			expected: []int{21, 6, 14, 15, 16, 17, 18, 19, 20, 9, 8, 7, 6, 21}, // 置換されずそのまま
		},
		{
			name: "区間内が発着の場合は置換されない",
			// 鹿部(14) -> 森(20) -> 石倉(22)
			input:    []int{14, 15, 16, 17, 18, 19, 20, 22},
			expected: []int{14, 15, 16, 17, 18, 19, 20, 22}, // 置換条件(大沼から森の完全一致)を満たさないためそのまま
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := c.Correct(tt.input, g)
			if err != nil {
				t.Fatalf("予期しないエラーが発生しました: %v", err)
			}
			if !reflect.DeepEqual(res, tt.expected) {
				t.Errorf("実際 %v, 期待値 %v", res, tt.expected)
			}
		})
	}
}

func TestCorrectPathForMode(t *testing.T) {
	g := &mockGraphCorrector{names: map[int]string{1: "北九州市内", 2: "小倉", 3: "西小倉", 4: "博多"}}
	for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
		t.Run(mode, func(t *testing.T) {
			original := []int{1, 2, 3, 4}
			var corrector PathCorrector = NewPipelineCorrector(NewPostZoneCleanupCorrector())
			want := []int{1, 2, 4}
			if mode == "uncorrect" {
				corrector = nil // 補正禁止では補正処理自体を呼ばない。
				want = original
			}
			got, err := CorrectPathForMode(original, g, corrector, mode)
			if err != nil {
				t.Fatal(err)
			}
			if !reflect.DeepEqual(got, want) {
				t.Fatalf("実際 %v, 期待値 %v", got, want)
			}
			if !reflect.DeepEqual(original, []int{1, 2, 3, 4}) {
				t.Fatal("入力経路が変更されています")
			}
		})
	}
}

func TestUncorrectAppliesOnlyShinkansenOverlap(t *testing.T) {
	g := &mockGraphCorrector{names: map[int]string{
		1: "御茶ノ水", 2: "神田", 3: "東京", 4: "秋葉原",
	}}
	path := []int{1, 2, 3, 2, 4}
	want := []int{1, 2, 4}
	otherCorrection := fixedPathCorrector{path: []int{3}}
	pipeline := NewPipelineCorrector(NewShinkansenOverlapCorrector(), otherCorrection)

	got, err := CorrectPathForMode(path, g, pipeline, "uncorrect")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("CorrectPathForMode = %v, 期待値 %v", got, want)
	}

	got, _, before, err := CorrectPathForModeWithRouteExtensionsAndPreShinkansenPath(path, g, pipeline, nil, "uncorrect")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(got, want) || !reflect.DeepEqual(before, path) {
		t.Fatalf("補正後=%v, 補正前=%v, 期待値=%v, %v", got, before, want, path)
	}
}

func TestUncorrectAppliesRule43_2(t *testing.T) {
	g := &mockGraphCorrector{names: map[int]string{
		1: "城野", 2: "南小倉", 3: "西小倉", 4: "小倉",
		5: "博多", 6: "吉塚", 7: "柚須", 8: "原町",
		9: "竹下", 10: "新下関",
	}}
	for _, tt := range []struct {
		name string
		path []int
		want []int
	}{
		{"西小倉", []int{1, 2, 3, 4, 5, 9}, []int{1, 2, 3, 5, 9}},
		{"吉塚", []int{10, 4, 5, 6, 7, 8}, []int{10, 4, 6, 7, 8}},
		{"両方", []int{1, 2, 3, 4, 5, 6, 7, 8}, []int{1, 2, 3, 6, 7, 8}},
		{"逆方向", []int{9, 5, 4, 3, 2, 1}, []int{9, 5, 3, 2, 1}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			otherCorrection := fixedPathCorrector{path: []int{10}}
			pipeline := NewPipelineCorrector(NewShinkansenOverlapCorrector(), NewRule43_2Corrector(), otherCorrection)
			got, err := CorrectPathForMode(tt.path, g, pipeline, "uncorrect")
			if err != nil || !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("CorrectPathForMode = %v, %v; 期待値 %v", got, err, tt.want)
			}
			got, _, before, err := CorrectPathForModeWithRouteExtensionsAndPreShinkansenPath(tt.path, g, pipeline, nil, "uncorrect")
			if err != nil || !reflect.DeepEqual(got, tt.want) || !reflect.DeepEqual(before, tt.path) {
				t.Fatalf("補正後=%v, 補正前=%v, エラー=%v; 期待値 %v, %v", got, before, err, tt.want, tt.path)
			}
		})
	}
}

func TestNormalStillAppliesRule43_2(t *testing.T) {
	g := &mockGraphCorrector{names: map[int]string{
		1: "城野", 2: "南小倉", 3: "西小倉", 4: "小倉", 5: "博多", 6: "竹下",
	}}
	path := []int{1, 2, 3, 4, 5, 6}
	want := []int{1, 2, 3, 5, 6}
	corrector := NewPipelineCorrector(NewShinkansenOverlapCorrector(), NewRule43_2Corrector())
	got, err := CorrectPathForMode(path, g, corrector, "normal")
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("CorrectPathForMode(通常) = %v, %v; 期待値 %v", got, err, want)
	}
}

func TestOverlapExpandsOnlyAffectedEdges(t *testing.T) {
	names := []string{"A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "X"}
	g := &mockGraphCorrector{names: map[int]string{}}
	for i, name := range names {
		g.names[i] = name
	}
	ids := func(names ...string) []int {
		var p []int
		for _, name := range names {
			id, _ := g.GetID(name)
			p = append(p, id)
		}
		return p
	}
	c := &ShinkansenOverlapCorrector{
		mappings:          [][]string{{"A", "B", "C"}, {"D", "E", "F"}, {"G", "X", "H"}, {"H", "I", "J", "K"}, {"L", "N", "M"}},
		overlapDeductions: [][]string{{"E", "F", "E"}, {"J", "K", "J"}},
	}
	for _, reverse := range []bool{false, true} {
		path := ids("A", "C", "D", "F", "E", "G", "H", "K", "J", "L", "M")
		want := ids("A", "C", "D", "E", "G", "H", "I", "J", "L", "M")
		if reverse {
			slices.Reverse(path)
			slices.Reverse(want)
		}
		original := slices.Clone(path)
		got, err := c.Correct(path, g)
		if err != nil || !slices.Equal(got, want) {
			t.Fatalf("逆方向=%v: 補正結果=%v、期待値=%v、エラー=%v", reverse, got, want, err)
		}
		if !slices.Equal(path, original) {
			t.Fatal("入力を書き換えた")
		}
	}
}
