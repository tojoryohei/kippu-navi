package usecase

import (
	"calculation-engine/internal/ticket/graph"
	"reflect"
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
			name:     "新幹線エッジの展開（順方向）",
			input:    []int{1, 7}, // 姫路 -> 相生
			expected: []int{1, 2, 3, 4, 5, 6, 7},
		},
		{
			name:     "新幹線エッジの展開（逆方向）",
			input:    []int{7, 1}, // 相生 -> 姫路
			expected: []int{7, 6, 5, 4, 3, 2, 1},
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
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(res, tt.expected) {
				t.Errorf("got %v, want %v", res, tt.expected)
			}
		})
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

	c := NewSpecificSectionCorrector()

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
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(res, tt.expected) {
				t.Errorf("got %v, want %v", res, tt.expected)
			}
		})
	}
}

func TestPipelineCorrector(t *testing.T) {
	g := &mockGraphCorrector{
		names: map[int]string{
			// シナリオ1用（新幹線展開＋重複控除）
			1: "御茶ノ水",
			2: "神田",
			3: "東京",
			4: "秋葉原",
			5: "御徒町",
			6: "上野",

			// シナリオ2用（経路特定区間）
			10: "新大阪",
			11: "大阪",
			12: "（環）福島",
			13: "野田",
			14: "西九条",
			15: "弁天町",
			16: "大正",
			17: "芦原橋",
			18: "今宮",
			19: "新今宮",
			20: "天王寺",
			21: "東部市場前",
			// 東側（置換先）
			31: "天満",
			32: "桜ノ宮",
			33: "京橋",
			34: "大阪城公園",
			35: "森ノ宮",
			36: "玉造",
			37: "鶴橋",
			38: "桃谷",
			39: "寺田町",

			// シナリオ3用（新幹線＋経路特定区間ミックス）
			50: "京都",
			51: "山科",
			52: "大津",
			53: "膳所",
			54: "石山",
			55: "（東）瀬田",
			56: "南草津",
			57: "草津",
			58: "栗東",
			59: "守山",
			60: "野洲",
			61: "篠原",
			62: "近江八幡",
			63: "安土",
			64: "能登川",
			65: "稲枝",
			66: "河瀬",
			67: "南彦根",
			68: "彦根",
			69: "米原",
			70: "坂田",
			71: "田村",
			72: "長浜",
			73: "虎姫",
			74: "河毛",
			75: "高月",
			76: "木ノ本",
			77: "余呉",
			78: "近江塩津",
			79: "新疋田",
			// 湖西線（置換先）
			81: "大津京",
			82: "唐崎",
			83: "比叡山坂本",
			84: "おごと温泉",
			85: "堅田",
			86: "（湖）小野",
			87: "和邇",
			88: "蓬莱",
			89: "志賀",
			90: "比良",
			91: "近江舞子",
			92: "北小松",
			93: "近江高島",
			94: "安曇川",
			95: "新旭",
			96: "近江今津",
			97: "近江中庄",
			98: "マキノ",
			99: "永原",
		},
	}

	c1 := NewShinkansenOverlapCorrector()
	c2 := NewSpecificSectionCorrector()
	pipeline := NewPipelineCorrector(c1, c2)

	tests := []struct {
		name     string
		input    []int
		expected []int
	}{
		{
			name: "ユースケース1: 新幹線展開＋分岐駅通過特例による控除（御茶ノ水〜東京〜上野）",
			// 御茶ノ水(1) -> 神田(2) -> 東京(3) -> 上野(6) [※東京〜上野は新幹線]
			input: []int{1, 2, 3, 6},
			// 展開後: 御茶ノ水(1) -> 神田(2) -> 東京(3) -> 神田(2) -> 秋葉原(4) -> 御徒町(5) -> 上野(6)
			// 神田〜東京の折り返し（2->3->2）が検出され、進入(御茶ノ水)と退出(秋葉原)が異なるため控除される。
			// 控除後: 御茶ノ水(1) -> 神田(2) -> 秋葉原(4) -> 御徒町(5) -> 上野(6)
			expected: []int{1, 2, 4, 5, 6},
		},
		{
			name: "ユースケース2: 経路特定区間の置換（新大阪〜大阪〜(西側)〜天王寺〜東部市場前）",
			// 新大阪(10)から環状線西側を経由して東部市場前(21)へ抜けるルート
			input: []int{10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21},
			// 環状線東側を経由するルートに置換される
			expected: []int{10, 11, 31, 32, 33, 34, 35, 36, 37, 38, 39, 20, 21},
		},
		{
			name: "ユースケース3: 新幹線展開からの経路特定区間置換（京都〜米原〜近江塩津〜新疋田）",
			// 京都(50) -> 米原(69) [※京都〜米原は新幹線] -> 坂田(70) ... 近江塩津(78) -> 新疋田(79)
			input: []int{50, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79},
			// 1. 新幹線展開: 京都(50) -> 山科(51) -> 大津(52) ... 米原(69) -> 坂田(70) ... 近江塩津(78) -> 新疋田(79)
			// 2. 経路特定区間: 山科(51)〜近江塩津(78) が 湖西線経由 に置換される。
			//    (※条件: 山科の進入前が京都(50)、近江塩津の退出後が新疋田(79)に合致)
			expected: []int{50, 51, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99, 78, 79},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			res, err := pipeline.Correct(tt.input, g)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if !reflect.DeepEqual(res, tt.expected) {
				t.Errorf("got %v\nwant %v", res, tt.expected)
			}
		})
	}
}
