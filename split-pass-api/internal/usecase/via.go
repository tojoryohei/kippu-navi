package usecase

import (
	"split-pass-api/internal/graph"
)

// viaBypassRule は経由印字のための特例区間ルールを定義します。
type viaBypassRule struct {
	Pattern     []string // 特例としてマッチさせる駅の並び
	Vias        []string // 追加する経由名
	EvaluateEnd bool     // 💡 true: 終端駅を次のループで評価(第69条), false: 終端駅もスキップ(東京近郊)

	// 前の駅の条件
	AnyPrev     bool     // trueなら前の駅を問わない
	PrevAllowed []string // AnyPrevがfalseの場合、ここに列挙された駅のみ許可

	// 次の駅の条件
	AnyNext     bool     // trueなら次の駅を問わない
	NextAllowed []string // AnyNextがfalseの場合、ここに列挙された駅のみ許可
}

// ドメイン知識（ルール）を宣言的に定義
var viaRules = []viaBypassRule{
	// ==========================================
	// 第69条 経路特定区間 (EvaluateEnd = true)
	// ==========================================
	// (1) 大沼〜森
	{
		Pattern: []string{"大沼", "大沼公園", "赤井川", "駒ケ岳", "森"}, Vias: []string{"函館線"}, EvaluateEnd: true,
		PrevAllowed: []string{"新函館北斗"}, NextAllowed: []string{"石倉"},
	},
	{
		Pattern: []string{"森", "駒ケ岳", "赤井川", "大沼公園", "大沼"}, Vias: []string{"函館線"}, EvaluateEnd: true,
		PrevAllowed: []string{"石倉"}, NextAllowed: []string{"新函館北斗"},
	},
	// (2) 日暮里〜赤羽
	{
		Pattern: []string{"日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽"}, Vias: []string{"王子", "尾久"}, EvaluateEnd: true,
		PrevAllowed: []string{"鶯谷", "三河島"}, NextAllowed: []string{"川口", "北赤羽", "十条"},
	},
	{
		Pattern: []string{"赤羽", "東十条", "王子", "上中里", "田端", "西日暮里", "日暮里"}, Vias: []string{"王子", "尾久"}, EvaluateEnd: true,
		PrevAllowed: []string{"川口", "北赤羽", "十条"}, NextAllowed: []string{"鶯谷", "三河島"},
	},
	// (3) 赤羽〜大宮
	{
		Pattern: []string{"赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"}, Vias: []string{"川口", "北赤羽"}, EvaluateEnd: true,
		PrevAllowed: []string{"尾久", "東十条", "十条"}, NextAllowed: []string{"土呂", "宮原", "（川）日進"},
	},
	{
		Pattern: []string{"大宮", "さいたま新都心", "与野", "北浦和", "浦和", "南浦和", "蕨", "西川口", "川口", "赤羽"}, Vias: []string{"川口", "北赤羽"}, EvaluateEnd: true,
		PrevAllowed: []string{"土呂", "宮原", "（川）日進"}, NextAllowed: []string{"尾久", "東十条", "十条"},
	},
	// (4) 品川〜鶴見
	{
		Pattern: []string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見"}, Vias: []string{"東海道線"}, EvaluateEnd: true,
		PrevAllowed: []string{"高輪ゲートウェイ", "大崎"}, NextAllowed: []string{"新子安", "国道", "羽沢横浜国大"},
	},
	{
		Pattern: []string{"鶴見", "川崎", "蒲田", "大森", "大井町", "品川"}, Vias: []string{"東海道線"}, EvaluateEnd: true,
		PrevAllowed: []string{"新子安", "国道", "羽沢横浜国大"}, NextAllowed: []string{"高輪ゲートウェイ", "大崎"},
	},

	// ==========================================
	// 東京ー秋葉原ー錦糸町　 (EvaluateEnd = true)
	// ==========================================
	// (5)東京～秋葉原
	{
		Pattern: []string{"東京", "神田", "秋葉原"}, Vias: []string{"[近]東北"}, EvaluateEnd: true,
		PrevAllowed: []string{"有楽町", "八丁堀", "新日本橋"}, NextAllowed: []string{"神田", "御茶ノ水"},
	},
	{
		Pattern: []string{"秋葉原", "神田", "東京"}, Vias: []string{"[近]東北"}, EvaluateEnd: true,
		PrevAllowed: []string{"有楽町", "八丁堀", "新日本橋"}, NextAllowed: []string{"馬喰町", "亀戸"},
	},
	// (6)秋葉原～錦糸町
	{
		Pattern: []string{"秋葉原", "浅草橋", "両国", "錦糸町"}, Vias: []string{"両国"}, EvaluateEnd: true,
		PrevAllowed: []string{"神田", "御茶ノ水", "御徒町"}, NextAllowed: []string{"馬喰町", "亀戸"},
	},
	{
		Pattern: []string{"錦糸町", "両国", "浅草橋", "秋葉原"}, Vias: []string{"両国"}, EvaluateEnd: true,
		PrevAllowed: []string{"馬喰町", "亀戸"}, NextAllowed: []string{"神田", "御茶ノ水", "御徒町"},
	},
	// (7)錦糸町～東京
	{
		Pattern: []string{"錦糸町", "馬喰町", "新日本橋", "東京"}, Vias: []string{"馬喰町"}, EvaluateEnd: true,
		PrevAllowed: []string{"両国", "亀戸"}, NextAllowed: []string{"神田", "有楽町", "八丁堀"},
	},
	{
		Pattern: []string{"東京", "新日本橋", "馬喰町", "錦糸町"}, Vias: []string{"馬喰町"}, EvaluateEnd: true,
		PrevAllowed: []string{"神田", "有楽町", "八丁堀"}, NextAllowed: []string{"両国", "亀戸"},
	},
	// (8)神田->東京
	{
		Pattern: []string{"神田", "東京"}, Vias: []string{}, EvaluateEnd: true,
		PrevAllowed: []string{"御茶ノ水", "秋葉原"}, NextAllowed: []string{"有楽町", "八丁堀", "新日本橋"},
	},

	// ==========================================
	// 神田ー秋葉原ー御茶ノ水 (EvaluateEnd = false)
	// ==========================================
	// (9) 東北 (東京〜秋葉原)
	{
		Pattern: []string{"東京", "神田", "秋葉原"}, Vias: []string{"[近]東北"}, EvaluateEnd: false,
		AnyPrev: true, NextAllowed: []string{"御徒町", "浅草橋"},
	},
	{
		Pattern: []string{"神田", "秋葉原"}, Vias: []string{"[近]東北"}, EvaluateEnd: false,
		NextAllowed: []string{"御徒町", "浅草橋"}, // i=0 から開始する場合用
	},
	{
		Pattern: []string{"秋葉原", "神田", "東京"}, Vias: []string{"[近]東北"}, EvaluateEnd: false,
		PrevAllowed: []string{"御徒町", "浅草橋"}, AnyNext: true,
	},
	{
		Pattern: []string{"秋葉原", "神田"}, Vias: []string{"[近]東北"}, EvaluateEnd: false,
		PrevAllowed: []string{"御徒町", "浅草橋"}, // 終端で終わる場合用
	},
	// (10) [近]中央 (東京〜御茶ノ水)
	{
		Pattern: []string{"東京", "神田", "御茶ノ水"}, Vias: []string{"[近]中央"}, EvaluateEnd: false,
		AnyPrev: true, NextAllowed: []string{"水道橋"},
	},
	{
		Pattern: []string{"神田", "御茶ノ水"}, Vias: []string{"[近]中央"}, EvaluateEnd: false,
		NextAllowed: []string{"水道橋"},
	},
	{
		Pattern: []string{"御茶ノ水", "神田", "東京"}, Vias: []string{"[近]中央"}, EvaluateEnd: false,
		PrevAllowed: []string{"水道橋"}, AnyNext: true,
	},
	{
		Pattern: []string{"御茶ノ水", "神田"}, Vias: []string{"[近]中央"}, EvaluateEnd: false,
		PrevAllowed: []string{"水道橋"},
	},
	// (11) [近]総武 (浅草橋〜水道橋)
	{
		Pattern: []string{"浅草橋", "秋葉原", "御茶ノ水", "水道橋"}, Vias: []string{"[近]総武"}, EvaluateEnd: false,
		AnyPrev: true, AnyNext: true,
	},
	{
		Pattern: []string{"秋葉原", "御茶ノ水", "水道橋"}, Vias: []string{"[近]総武"}, EvaluateEnd: false,
		AnyNext: true,
	},
	{
		Pattern: []string{"浅草橋", "秋葉原", "御茶ノ水"}, Vias: []string{"[近]総武"}, EvaluateEnd: false,
		AnyPrev: true,
	},
	{
		Pattern: []string{"秋葉原", "御茶ノ水"}, Vias: []string{"[近]総武"}, EvaluateEnd: false,
	},
	{
		Pattern: []string{"水道橋", "御茶ノ水", "秋葉原", "浅草橋"}, Vias: []string{"[近]総武"}, EvaluateEnd: false,
		AnyPrev: true, AnyNext: true,
	},
	{
		Pattern: []string{"御茶ノ水", "秋葉原", "浅草橋"}, Vias: []string{"[近]総武"}, EvaluateEnd: false,
		AnyNext: true,
	},
	{
		Pattern: []string{"水道橋", "御茶ノ水", "秋葉原"}, Vias: []string{"[近]総武"}, EvaluateEnd: false,
		AnyPrev: true,
	},
	{
		Pattern: []string{"御茶ノ水", "秋葉原"}, Vias: []string{"[近]総武"}, EvaluateEnd: false,
	},
}

// GetVia は経路中の分岐駅の名前リストを返します。
func GetVia(g *graph.Graph, path []int) []string {
	if len(path) < 2 {
		return []string{}
	}

	stationNameList := make([]string, len(path))
	for i, stationID := range path {
		stationNameList[i] = g.IDToName[stationID]
	}

	var via []string

	for i := 0; i < len(path)-1; i++ {
		// 1. 特例区間の判定（2駅の場合も i=0 の1回だけここを通過する）
		if addedVia, skipCount, matched := evaluateBypassViaRules(stationNameList, i); matched {
			via = append(via, addedVia...)
			i += skipCount
			continue
		}

		if len(path) == 2 {
			continue
		}

		// 2. 通常の分岐駅判定（3駅以上の経路でのみ実行される）
		if len(g.Edges[path[i]]) > 2 {
			if i < len(path)-2 {
				via = append(via, stationNameList[i+1])
			} else {
				if i > 0 && !(len(g.Edges[path[i-1]]) > 2) {
					via = append(via, stationNameList[i])
				} else if i == 0 {
					via = append(via, stationNameList[i])
				}
			}
		}
	}

	if len(path) == 2 && len(via) == 0 {
		return []string{}
	}

	if len(via) == 0 {
		via = append(via, stationNameList[1])
	}

	return via
}

func evaluateBypassViaRules(path []string, i int) ([]string, int, bool) {
	for _, rule := range viaRules {
		if isViaRuleMatch(path, i, rule) {
			skipCount := 0
			if rule.EvaluateEnd {
				skipCount = len(rule.Pattern) - 2
			} else {
				skipCount = len(rule.Pattern) - 1
			}
			if skipCount < 0 {
				skipCount = 0
			}
			return rule.Vias, skipCount, true
		}
	}
	return nil, 0, false
}

// isViaRuleMatch は特定のルールが現在のインデックスに合致するかを判定します。
func isViaRuleMatch(path []string, i int, rule viaBypassRule) bool {
	if i+len(rule.Pattern) > len(path) {
		return false
	}
	for j, station := range rule.Pattern {
		if path[i+j] != station {
			return false
		}
	}

	if i > 0 && !rule.AnyPrev {
		if len(rule.PrevAllowed) == 0 || !containsStationName(rule.PrevAllowed, path[i-1]) {
			return false
		}
	}

	endIdx := i + len(rule.Pattern)
	if endIdx < len(path) && !rule.AnyNext {
		if len(rule.NextAllowed) == 0 || !containsStationName(rule.NextAllowed, path[endIdx]) {
			return false
		}
	}

	return true
}

func containsStationName(list []string, item string) bool {
	for _, s := range list {
		if s == item {
			return true
		}
	}
	return false
}
