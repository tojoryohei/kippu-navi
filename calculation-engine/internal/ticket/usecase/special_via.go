package usecase

import "slices"

// 特殊経由線の接続駅と、母線の内方・特殊経由線側に隣接する駅。
// 駅名の印字そのものは printings.json に任せる。
type specialViaEnd struct {
	station, branch, kana string
	inward                []string
}

type specialViaRule struct {
	line, mother, normal string
	ends                 [2]specialViaEnd
	// 越後・赤穂・呉・宇部・長与支線の、入力方法ごとの例外規則を使う。
	exception bool
}

// 東北本線の王子経由は、駅間データでは複数のコードに分かれる。
var specialViaMotherAliases = map[string][]string{
	"トウホ": {"トウホ２", "ヤマテ２"},
}

// 対象区間は両端で区切った駅間集合として保持する。
var specialViaRules = []specialViaRule{
	{line: "ハコタ２", mother: "ハコタ", ends: [2]specialViaEnd{{"大沼", "鹿部", "ハコタオ", []string{"大沼公園"}}, {"森", "東森", "ハコタモ", []string{"駒ケ岳"}}}},
	{line: "ムロラ", mother: "ハコタ", ends: [2]specialViaEnd{{"長万部", "静狩", "ムロラオ", []string{"黒松内"}}, {"岩見沢", "志文", "ムロライ", []string{"上幌向"}}}},
	{line: "コノウ", mother: "オウウ", ends: [2]specialViaEnd{{"東能代", "能代", "コノウヒ", []string{"鶴形"}}, {"川部", "藤崎", "コノウカ", []string{"撫牛子"}}}},
	{line: "エチコ", mother: "シンエ", exception: true, ends: [2]specialViaEnd{{"柏崎", "東柏崎", "エチコカ", []string{"茨目"}}, {"新潟", "上所", "エチコニ", []string{"越後石山"}}}},
	{line: "シヨハ", mother: "トウホ", ends: [2]specialViaEnd{{"日暮里", "三河島", "シヨハニ", []string{"尾久", "西日暮里"}}, {"岩沼", "逢隈", "シヨハイ", []string{"槻木"}}}},
	{line: "トウホ４", mother: "トウホ", ends: [2]specialViaEnd{{"赤羽", "北赤羽", "トウホア", []string{"川口"}}, {"大宮", "北与野", "トウホオ", []string{"さいたま新都心"}}}},
	{line: "チユト２", mother: "チユト", ends: [2]specialViaEnd{{"岡谷", "川岸", "チユトオ", []string{"みどり湖"}}, {"塩尻", "（中）小野", "チユトシ", []string{"みどり湖"}}}},
	{line: "ナリタ", mother: "ソウフ", ends: [2]specialViaEnd{{"佐倉", "酒々井", "ナリタサ", []string{"南酒々井"}}, {"松岸", "椎柴", "ナリタマ", []string{"猿田"}}}},
	{line: "ウチホ", mother: "ソトホ", ends: [2]specialViaEnd{{"蘇我", "浜野", "ウチホソ", []string{"鎌取"}}, {"安房鴨川", "太海", "ウチホア", []string{"安房天津"}}}},
	{line: "ヒンカ", mother: "トウカ", ends: [2]specialViaEnd{{"品川", "西大井", "ヒンカシ", []string{"大井町"}}, {"鶴見", "新川崎", "ヒンカツ", []string{"川崎"}}}},
	{line: "ネキシ", mother: "トウカ", ends: [2]specialViaEnd{{"横浜", "桜木町", "ネキシヨ", []string{"保土ケ谷"}}, {"大船", "本郷台", "ネキシオ", []string{"戸塚"}}}},
	{line: "コテン", mother: "トウカ", ends: [2]specialViaEnd{{"国府津", "下曽我", "コテンコ", []string{"鴨宮"}}, {"沼津", "大岡", "コテンヌ", []string{"三島"}}}},
	{line: "アコウ", mother: "サンヨ", exception: true, ends: [2]specialViaEnd{{"相生", "西相生", "アコウア", []string{"有年"}}, {"東岡山", "大多羅", "アコウヒ", []string{"（陽）上道"}}}},
	{line: "クレ", mother: "サンヨ", exception: true, ends: [2]specialViaEnd{{"三原", "須波", "クレミ", []string{"本郷"}}, {"海田市", "矢野", "クレカ", []string{"安芸中野"}}}},
	{line: "カント", mother: "サンヨ", ends: [2]specialViaEnd{{"岩国", "西岩国", "カントイ", []string{"南岩国"}}, {"櫛ケ浜", "周防花岡", "カントク", []string{"（陽）下松"}}}},
	{line: "ウヘ", mother: "サンヨ", exception: true, ends: [2]specialViaEnd{{"新山口", "上嘉川", "ウヘオ", []string{"嘉川"}}, {"宇部", "岩鼻", "ウヘウ", []string{"厚東"}}}},
	{line: "チクホ", mother: "カコシ", ends: [2]specialViaEnd{{"折尾", "東水巻", "チクホオ", []string{"水巻"}}, {"原田", "筑前山家", "チクホハ", []string{"天拝山"}}}},
	{line: "ナカサ２", mother: "ナカサ", normal: "ナカサ", exception: true, ends: [2]specialViaEnd{{"喜々津", "東園", "ナカサキ", []string{"市布"}}, {"浦上", "西浦上", "ナカサウ", []string{"現川"}}}},
}

func specialViaEdges(edges []edgeLineRecord) []map[string]bool {
	result := make([]map[string]bool, len(specialViaRules))
	for i, rule := range specialViaRules {
		adjacent := make(map[string][]string)
		for _, edge := range edges {
			if edge.Line == rule.line {
				adjacent[edge.Station0] = append(adjacent[edge.Station0], edge.Station1)
				adjacent[edge.Station1] = append(adjacent[edge.Station1], edge.Station0)
			}
		}
		pairs := make(map[string]bool)
		visited := map[string]bool{rule.ends[0].station: true, rule.ends[1].station: true}
		pending := []string{rule.ends[0].branch}
		pairs[stationPair(rule.ends[0].station, rule.ends[0].branch)] = true
		for len(pending) > 0 {
			station := pending[len(pending)-1]
			pending = pending[:len(pending)-1]
			if visited[station] {
				continue
			}
			visited[station] = true
			for _, next := range adjacent[station] {
				pairs[stationPair(station, next)] = true
				if !visited[next] {
					pending = append(pending, next)
				}
			}
		}
		result[i] = pairs
	}
	return result
}

type specialViaConnection int

const (
	viaInterior specialViaConnection = iota
	viaJunctionTerminal
	viaMotherInward
	viaMotherOutward
	viaOtherLine
)

type specialViaRun struct {
	rule, start, end int // start/end は駅の位置（end の直前までが対象辺）。
	from, to         specialViaConnection
	codes            []string
}

func (r specialViaRule) connection(path []ViaStep, at, outside int) specialViaConnection {
	for _, end := range r.ends {
		if path[at].StationName != end.station {
			continue
		}
		if outside < 0 || outside >= len(path) {
			return viaJunctionTerminal
		}
		edge := min(at, outside)
		line := path[edge].LineName
		isMother := line == r.mother || slices.Contains(specialViaMotherAliases[r.mother], line)
		if !isMother {
			return viaOtherLine
		}
		if containsStation(end.inward, path[outside].StationName) {
			return viaMotherInward
		}
		return viaMotherOutward
	}
	return viaInterior
}

func inputSpecialVia(run specialViaRun, rule specialViaRule) bool {
	if run.from == viaMotherInward || run.to == viaMotherInward {
		return true
	}
	if rule.exception && (run.from == viaJunctionTerminal || run.to == viaJunctionTerminal) {
		return true
	}
	return run.from == viaMotherOutward && run.to == viaInterior || run.to == viaMotherOutward && run.from == viaInterior
}

func automaticSpecialVia(run specialViaRun, rule specialViaRule) bool {
	return run.from == viaMotherInward || run.to == viaMotherInward || rule.exception && (run.from != viaInterior || run.to != viaInterior)
}

func specialViaRuns(path []ViaStep, choose func(specialViaRun, specialViaRule) bool) []specialViaRun {
	loadViaData()
	var runs []specialViaRun
	for index, rule := range specialViaRules {
		matches := func(i int) bool {
			return i < len(path)-1 && path[i].LineName == rule.line && viaData.specialViaEdges[index][stationPair(path[i].StationName, path[i+1].StationName)]
		}
		for i := 0; i < len(path)-1; i++ {
			if !matches(i) {
				continue
			}
			start := i
			for matches(i) {
				i++
			}
			run := specialViaRun{rule: index, start: start, end: i, from: rule.connection(path, start, start-1), to: rule.connection(path, i, i+1)}
			if choose(run, rule) {
				run.codes = rule.codes(path[start].StationName, path[i].StationName)
			}
			runs = append(runs, run)
			i--
		}
	}
	return runs
}

func (r specialViaRule) codes(start, end string) []string {
	var codes []string
	for _, station := range []string{start, end} {
		for _, junction := range r.ends {
			if junction.station == station {
				codes = append(codes, junction.kana)
			}
		}
	}
	return codes
}

// 同一区間内でコードを反復しないよう、両端を通る場合だけ最後の辺で
// 二つ目のコードへ切り替える。位置を保持することで既存の省略処理と合成できる。
func specialViaOverrides(path []ViaStep, runs []specialViaRun) map[string]string {
	result := make(map[string]string)
	for _, run := range runs {
		codes := run.codes
		if len(codes) == 0 {
			if normal := specialViaRules[run.rule].normal; normal != "" {
				codes = []string{normal}
			} else {
				continue
			}
		}
		for i := run.start; i < run.end; i++ {
			code := codes[0]
			if i == run.end-1 {
				code = codes[len(codes)-1]
			}
			result[stationPair(path[i].StationName, path[i+1].StationName)] = code
		}
	}
	return result
}

func inputSpecialViaOverrides(path []ViaStep) map[string]string {
	return specialViaOverrides(path, specialViaRuns(path, inputSpecialVia))
}

func automaticSpecialViaOverrides(source, printed []ViaStep) map[string]string {
	sourceRuns := specialViaRuns(source, automaticSpecialVia)
	runs := specialViaRuns(printed, automaticSpecialVia)
	for i := range runs {
		run := &runs[i]
		for _, before := range sourceRuns {
			if run.rule != before.rule || !specialViaRunsOverlap(source, before, printed, *run) {
				continue
			}
			if len(before.codes) > 0 {
				// 特殊表記という選択を保持し、コードの向きは印字経路から取得する。
				run.codes = specialViaRules[run.rule].codes(printed[run.start].StationName, printed[run.end].StationName)
			}
		}
	}
	return specialViaOverrides(printed, runs)
}

func specialViaRunsOverlap(a []ViaStep, ar specialViaRun, b []ViaStep, br specialViaRun) bool {
	// 補正前後の区間を、共通する駅で対応付ける。
	for i := ar.start; i <= ar.end; i++ {
		for j := br.start; j <= br.end; j++ {
			if a[i].StationName == b[j].StationName {
				return true
			}
		}
	}
	return false
}
