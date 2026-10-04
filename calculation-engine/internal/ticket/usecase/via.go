package usecase

import (
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"sync"

	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
)

// ViaStep は入力経路の駅と、次駅までの路線識別子（JR線はカナコード）を表します。
type ViaStep struct {
	StationName string
	LineName    string
}

type printingRecord struct {
	Kana  string  `json:"kana"`
	Print *string `json:"print"`
}

type edgeLineRecord struct {
	Line     string `json:"line"`
	Station0 string `json:"station0"`
	Station1 string `json:"station1"`
}

type article70PrintingKanaRecord struct {
	Station0 string  `json:"station0"`
	Station1 string  `json:"station1"`
	Kana     *string `json:"kana"`
}

var viaData struct {
	once                  sync.Once
	printing              map[string]string
	privateLines          map[string]privateViaLine
	privateConnections    map[string]map[string]string
	shinkansenStationKana map[string]string
	physicalLineByPair    map[string]string
	cheapestLinesByPair   map[string][]string
	shinkansenStations    map[string]bool
	article70Routes       *ticketdomain.Article70Routes
	article70Kana         map[string]*string
	zoneRoutes            ticketdomain.ZoneRoutes
	specialViaEdges       []map[string]bool
}

func stationPair(a, b string) string {
	if a > b {
		a, b = b, a
	}
	return a + "\x00" + b
}

func loadViaData() {
	viaData.once.Do(func() {
		var printings []printingRecord
		if err := json.NewDecoder(graphdata.GetPrintingsReader()).Decode(&printings); err != nil {
			panic(err)
		}
		viaData.printing = make(map[string]string, len(printings))
		viaData.shinkansenStationKana = make(map[string]string)
		for _, item := range printings {
			if item.Print != nil {
				viaData.printing[item.Kana] = *item.Print
				if strings.HasSuffix(item.Kana, "Ｂ") {
					viaData.shinkansenStationKana[*item.Print] = item.Kana
				}
			}
		}

		var privateData struct {
			Lines       map[string]privateViaLine    `json:"lines"`
			Connections map[string]map[string]string `json:"connections"`
		}
		if err := json.NewDecoder(graphdata.GetPrivateViaReader()).Decode(&privateData); err != nil {
			panic(err)
		}
		viaData.privateLines = privateData.Lines
		viaData.privateConnections = privateData.Connections

		var edges []edgeLineRecord
		if err := json.NewDecoder(graphdata.GetEdgesReader()).Decode(&edges); err != nil {
			panic(err)
		}
		viaData.physicalLineByPair = make(map[string]string, len(edges))
		for _, edge := range edges {
			key := stationPair(edge.Station0, edge.Station1)
			if _, exists := viaData.physicalLineByPair[key]; !exists {
				viaData.physicalLineByPair[key] = edge.Line
			}
		}
		viaData.specialViaEdges = specialViaEdges(edges)

		var shinkansenEdges []edgeLineRecord
		if err := json.NewDecoder(graphdata.GetShinkansenEdgesReader()).Decode(&shinkansenEdges); err != nil {
			panic(err)
		}
		var privateEdges []edgeLineRecord
		if err := json.NewDecoder(graphdata.GetConnectingEdgesReader()).Decode(&privateEdges); err != nil {
			panic(err)
		}
		viaData.cheapestLinesByPair = cheapestViaCandidates(edges, shinkansenEdges, privateEdges)
		viaData.shinkansenStations = make(map[string]bool)
		for _, edge := range shinkansenEdges {
			viaData.shinkansenStations[edge.Station0] = true
			viaData.shinkansenStations[edge.Station1] = true
		}

		routesJSON, err := io.ReadAll(graphdata.GetArticle70RoutesReader())
		if err != nil {
			panic(err)
		}
		viaData.article70Routes, err = ticketdomain.LoadArticle70RoutesFromBytes(routesJSON)
		if err != nil {
			panic(err)
		}
		zoneRoutesJSON, err := io.ReadAll(graphdata.GetZoneRoutesReader())
		if err != nil {
			panic(err)
		}
		viaData.zoneRoutes, err = ticketdomain.LoadZoneRoutesFromBytes(zoneRoutesJSON)
		if err != nil {
			panic(err)
		}
		var article70Kana []article70PrintingKanaRecord
		if err := json.NewDecoder(graphdata.GetArticle70KanaReader()).Decode(&article70Kana); err != nil {
			panic(err)
		}
		viaData.article70Kana = make(map[string]*string, len(article70Kana))
		for _, item := range article70Kana {
			if item.Kana == nil || *item.Kana != "" {
				viaData.article70Kana[stationPair(item.Station0, item.Station1)] = item.Kana
			}
		}
	})
}

var shinkansenLines = map[string]bool{
	"カタシ": true, "キタシ": true, "キユシ": true, "シヨシ": true,
	"シンカ": true, "トホシ": true, "ニキシ": true, "ホクシ": true,
}

type privateViaLine struct {
	Print   *string `json:"print"`
	Company string  `json:"company"`
}

func isPrivateLine(line string) bool {
	_, ok := viaData.privateLines[line]
	return ok || len(line) > 0 && line[0] >= '0' && line[0] <= '9'
}

func privateConnection(line, station string) string {
	return viaData.privateConnections[station][viaData.privateLines[line].Company]
}

// JR線相互の会社境界は社線接続コードの対象ではない。
func privateCompany(line string) string {
	if company := viaData.privateLines[line].Company; company != "" {
		return company
	}
	if isPrivateLine(line) {
		return line
	} // 旧形式の私鉄識別子
	return ""
}

func changesPrivateCompany(before, after string) bool {
	return privateCompany(before) != privateCompany(after)
}

func isOsakaEast(line string) bool {
	return line == "オサヒ" || line == "オサヒ２"
}

func isShiginoHanaten(a, b string) bool {
	return a == "鴫野" && b == "放出" || a == "放出" && b == "鴫野"
}

// viaToken keeps codes until rendering. Private line identifiers are metadata,
// never kana codes. Literal stations are limited to loop-line markers and
// connections whose code is not available in the source data.
type viaToken struct {
	code        string
	privateLine string
	station     string
	isStation   bool
}

type viaPrinter struct {
	tokens               []viaToken
	previousLine         string
	printBoundaryStation bool
}

func (p *viaPrinter) appendStation(station string) {
	p.tokens = append(p.tokens, viaToken{station: station, isStation: true})
}

// shinkansenViaStationKana は実際の新幹線接続駅のコードを返します。
func shinkansenViaStationKana(path []ViaStep, i int) string {
	return viaData.shinkansenStationKana[path[i].StationName]
}

func (p *viaPrinter) appendLine(kana string) {
	p.tokens = append(p.tokens, viaToken{code: kana})
}

func (p *viaPrinter) appendPrivateStation(line, station string) {
	if code := privateConnection(line, station); code != "" {
		p.tokens = append(p.tokens, viaToken{code: code, privateLine: line, isStation: true})
	} else {
		p.appendStation(station)
	}
}

// render is the sole conversion from printing codes to display strings.
func (p *viaPrinter) render() []string {
	result := []string{}
	previous := viaToken{}
	for _, token := range p.tokens {
		printing := ""
		switch {
		case token.code != "":
			printing = viaData.printing[token.code]
		case token.isStation:
			printing = token.station
		case token.privateLine != "":
			if name := viaData.privateLines[token.privateLine].Print; name != nil {
				printing = *name
			}
		}
		if printing == "" {
			continue
		}
		if token.isStation {
			if len(result) > 0 && result[len(result)-1] == printing {
				continue
			}
		} else if !previous.isStation && token.code == previous.code && token.privateLine == previous.privateLine {
			continue
		}
		result = append(result, printing)
		previous = token
	}
	return result
}

func (p *viaPrinter) addBoundaryStation(station, line, stationKana string, allowBoundary, printShinkansenStation bool) {
	if !allowBoundary || !p.printBoundaryStation || line == "" || line == p.previousLine {
		return
	}
	if printShinkansenStation && (shinkansenLines[line] || shinkansenLines[p.previousLine]) {
		p.tokens = append(p.tokens, viaToken{code: stationKana, isStation: true})
	}
	if p.previousLine != "" && (isPrivateLine(line) || isPrivateLine(p.previousLine)) {
		if !changesPrivateCompany(p.previousLine, line) {
			// 同一会社内の路線切替の既存印字は、接続コードとは別に維持する。
			p.appendStation(station)
			return
		}
		if isPrivateLine(p.previousLine) {
			p.appendPrivateStation(p.previousLine, station)
		}
		if isPrivateLine(line) {
			p.appendPrivateStation(line, station)
		}
	}
}

func (p *viaPrinter) addLine(station, nextStation, line string) {
	if line == "" || (!p.printBoundaryStation && isPrivateLine(line)) {
		return
	}
	if line == p.previousLine {
		if line == "オオサ" && (station == "京橋" || station == "西九条") {
			p.appendStation(station)
		}
		return
	}

	if isPrivateLine(line) {
		p.tokens = append(p.tokens, viaToken{privateLine: line})
		p.previousLine = line
		return
	}
	_, ok := viaData.printing[line]
	if !ok {
		// 印字名のないJR線は直前の印字路線を維持する。
		return
	}
	if isShiginoHanaten(station, nextStation) {
		return
	}
	if isOsakaEast(p.previousLine) && isOsakaEast(line) {
		p.previousLine = line
		return
	}
	p.appendLine(line)
	p.previousLine = line
}

func (p *viaPrinter) addSelectedLine(station, nextStation, line, selected string) {
	if selected == "" {
		p.addLine(station, nextStation, line)
		return
	}
	p.appendLine(selected)
	// 新幹線・私鉄との接続判定には選択前の路線を使う。
	p.previousLine = line
}

// GetFareVia は運賃計算の入力路線を基準に印字します。
func GetFareVia(path []ViaStep) []string {
	LogInputViaKanas(path)
	return getFareVia(path, true, true, nil)
}

// LogInputViaKanas は補正・省略前の入力経路を特殊経由線コードで表示します。
func LogInputViaKanas(path []ViaStep) {
	encoded, _ := json.Marshal(inputViaKanas(path))
	fmt.Printf("カナコード：%s\n", encoded)
}

func inputViaKanas(path []ViaStep) []string {
	loadViaData()
	return viaKanas(path, inputSpecialViaOverrides(path))
}

func viaKanas(path []ViaStep, selected map[string]string) []string {
	codes := make([]string, 0, len(path))
	appendCode := func(code string) {
		if code != "" && (len(codes) == 0 || codes[len(codes)-1] != code) {
			codes = append(codes, code)
		}
	}
	for i := 0; i < len(path)-1; i++ {
		line := path[i].LineName
		previousLine := ""
		if i > 0 {
			previousLine = path[i-1].LineName
		}
		if changesPrivateCompany(previousLine, line) {
			appendCode(privateConnection(previousLine, path[i].StationName))
		}
		if line != previousLine && (shinkansenLines[line] || shinkansenLines[previousLine]) {
			appendCode(shinkansenViaStationKana(path, i))
		}
		if changesPrivateCompany(previousLine, line) {
			appendCode(privateConnection(line, path[i].StationName))
		}
		if code := selected[stationPair(path[i].StationName, path[i+1].StationName)]; code != "" {
			appendCode(code)
		} else if !isPrivateLine(line) {
			appendCode(line)
		}
	}
	if len(path) > 1 {
		appendCode(privateConnection(path[len(path)-2].LineName, path[len(path)-1].StationName))
	}
	if len(path) > 1 && shinkansenLines[path[len(path)-2].LineName] {
		appendCode(shinkansenViaStationKana(path, len(path)-1))
	}
	return codes
}

func getFareVia(path []ViaStep, printStartStation, printEndStation bool, suppressedStations map[string]bool) []string {
	return getFareViaWithSections(path, printStartStation, printEndStation, suppressedStations, viaSections{})
}

func getFareViaWithSections(path []ViaStep, printStartStation, printEndStation bool, suppressedStations map[string]bool, sections viaSections) []string {
	printer := viaPrinter{printBoundaryStation: true}
	if len(path) < 2 {
		return printer.render()
	}
	loadViaData()
	if sections.specialVia == nil {
		sections.specialVia = inputSpecialViaOverrides(path)
	}
	for i := 0; i < len(path)-1; i++ {
		station := path[i].StationName
		pair := stationPair(station, path[i+1].StationName)
		if codes := sections.replacements[station]; len(codes) > 0 {
			// 置換前の到着路線と置換後の先頭路線で接続駅を判定する。
			// 例: 姫路からの新幹線を西明石で山陽へ接続する逆方向。
			printer.addBoundaryStation(station, codes[0], shinkansenViaStationKana(path, i), true, (i > 0 || printStartStation) && !suppressedStations[station])
			appendViaReplacement(&printer, codes)
		}
		omitted := sections.omitted[pair]
		printer.addBoundaryStation(station, path[i].LineName, shinkansenViaStationKana(path, i), !omitted || sections.article70Entry[pair], (i > 0 || printStartStation) && !suppressedStations[station])
		if omitted {
			printer.previousLine = sections.replacementLineByEdge[pair]
			continue
		}
		printer.addSelectedLine(station, path[i+1].StationName, path[i].LineName, sections.specialVia[pair])
	}
	if printEndStation && !suppressedStations[path[len(path)-1].StationName] && shinkansenLines[printer.previousLine] {
		printer.tokens = append(printer.tokens, viaToken{code: shinkansenViaStationKana(path, len(path)-1), isStation: true})
	}
	return printer.render()
}

type viaSections struct {
	omitted               map[string]bool
	replacements          map[string][]string
	replacementLineByEdge map[string]string
	article70Entry        map[string]bool
	specialVia            map[string]string
}

func appendViaReplacement(printer *viaPrinter, codes []string) {
	for _, code := range codes {
		printer.appendLine(code)
	}
	printer.previousLine = codes[len(codes)-1]
}

func rule69ViaCodes(index int, reverse bool) []string {
	var codes []string
	switch index {
	case 4:
		codes = []string{"ソウフ", "ソトホ"}
	case 6:
		codes = []string{"オオサ"}
	}
	if reverse && len(codes) == 2 {
		codes[0], codes[1] = codes[1], codes[0]
	}
	return codes
}

func rule157ViaCodes(index int, reverse bool) []string {
	loadViaData()
	names := append([]string(nil), NewRule157Corrector().rules[index].to...)
	if reverse {
		for i, j := 0, len(names)-1; i < j; i, j = i+1, j-1 {
			names[i], names[j] = names[j], names[i]
		}
	}
	steps := make([]ViaStep, len(names))
	for i, name := range names {
		steps[i].StationName = name
		if i+1 < len(names) {
			steps[i].LineName = viaData.physicalLineByPair[stationPair(name, names[i+1])]
		}
	}
	selected := inputSpecialViaOverrides(steps)
	var codes []string
	for i := 0; i < len(steps)-1; i++ {
		code := steps[i].LineName
		if special := selected[stationPair(names[i], names[i+1])]; special != "" {
			code = special
		}
		if code != "" && (len(codes) == 0 || codes[len(codes)-1] != code) {
			codes = append(codes, code)
		}
	}
	return codes
}

type ruleViaSection struct {
	start, end           string
	startIndex, endIndex int // 照合元の経路上の位置
	codes                []string
}

func findRule69ViaSections(names []string) []ruleViaSection {
	return findRuleViaSections(names, NewRule69Corrector(), rule69ViaCodes)
}

func findRule157ViaSections(names []string) []ruleViaSection {
	return findRuleViaSections(names, NewRule157Corrector(), rule157ViaCodes)
}

func findRuleViaSections(names []string, corrector *SpecificSectionCorrector, codes func(int, bool) []string) []ruleViaSection {
	var sections []ruleViaSection
	for i := 0; i < len(names); i++ {
		for index, rule := range corrector.rules {
			if i+len(rule.from) > len(names) {
				continue
			}
			forward, reverse := true, true
			for j, name := range rule.from {
				forward = forward && names[i+j] == name
				reverse = reverse && names[i+j] == rule.from[len(rule.from)-1-j]
			}
			if !forward && !reverse {
				continue
			}
			before, after := rule.validBefore, rule.validAfter
			if reverse && !forward {
				before, after = after, before
			}
			if i > 0 && !containsStation(before, names[i-1]) || i+len(rule.from) < len(names) && !containsStation(after, names[i+len(rule.from)]) {
				continue
			}
			sections = append(sections, ruleViaSection{
				start: names[i], end: names[i+len(rule.from)-1],
				startIndex: i, endIndex: i + len(rule.from) - 1,
				codes: codes(index, reverse && !forward),
			})
			i += len(rule.from) - 1
			break
		}
	}
	return sections
}

func applyRuleViaSections(sections *viaSections, printNames []string, rules []ruleViaSection) {
	for _, rule := range rules {
		start := -1
		for i, station := range printNames {
			if start < 0 && station == rule.start {
				start = i
			} else if start >= 0 && station == rule.end {
				for j := start; j < i; j++ {
					pair := stationPair(printNames[j], printNames[j+1])
					sections.omitted[pair] = true
					if len(rule.codes) > 0 {
						sections.replacementLineByEdge[pair] = rule.codes[len(rule.codes)-1]
					}
				}
				if len(rule.codes) > 0 {
					sections.replacements[rule.start] = rule.codes
				}
				break
			}
		}
	}
}

func sectionsForPath(sourceNames, printNames []string, g graph.Graph, selected map[string]string, rule157Sections []ruleViaSection) viaSections {
	loadViaData()
	sections := viaSections{omitted: make(map[string]bool), replacements: make(map[string][]string), replacementLineByEdge: make(map[string]string), article70Entry: make(map[string]bool)}
	applyRuleViaSections(&sections, printNames, findRule69ViaSections(sourceNames))
	applyRuleViaSections(&sections, printNames, rule157Sections)
	for _, segment := range boldViaSegments(sourceNames, g) {
		// 太線エリア内だけで完結する乗車は第70条の印字処理をしない。
		if segment.start == 0 && segment.end == len(sourceNames)-1 {
			continue
		}
		startName, endName := sourceNames[segment.start], sourceNames[segment.end]
		start, end := -1, -1
		for i, name := range printNames {
			if start < 0 && name == startName {
				start = i
			} else if start >= 0 && name == endName {
				end = i
				break
			}
		}
		if start < 0 || end < 0 {
			continue
		}
		mode := "passing"
		if segment.start == 0 {
			mode = "from"
		} else if segment.end == len(sourceNames)-1 {
			mode = "to"
		}
		var codes []string
		if mode != "passing" {
			route := viaData.article70Routes.GetRoute(mode, startName, endName)
			if len(route) == 0 {
				continue
			}
			if route[0] != startName {
				route = append([]string{startName}, route...)
			}
			if route[len(route)-1] != endName {
				route = append(route, endName)
			}
			for i := 0; i < len(route)-1; i++ {
				pair := stationPair(route[i], route[i+1])
				kana, configured := viaData.article70Kana[pair]
				// 東京で太線エリア外へ接続する発着経路では、東京〜神田を印字する。
				tokyoBoundary := pair == stationPair("東京", "神田") &&
					(mode == "from" && endName == "東京" || mode == "to" && startName == "東京")
				code := ""
				if configured && kana == nil {
					if !tokyoBoundary {
						continue
					}
					code = "トウホ"
				} else if configured {
					code = *kana
				} else {
					code = viaData.physicalLineByPair[pair]
				}
				if special := selected[pair]; special != "" {
					code = special
				}
				if code != "" && (len(codes) == 0 || codes[len(codes)-1] != code) {
					codes = append(codes, code)
				}
			}
		}
		for i := start; i < end; i++ {
			pair := stationPair(printNames[i], printNames[i+1])
			if i == start && !sections.omitted[pair] {
				sections.article70Entry[pair] = true
			}
			sections.omitted[pair] = true
			if len(codes) > 0 {
				sections.replacementLineByEdge[pair] = codes[len(codes)-1]
			}
		}
		if len(codes) > 0 {
			sections.replacements[startName] = codes
		}
	}
	return sections
}

type boldViaSegment struct{ start, end int }

func boldViaSegments(names []string, g graph.Graph) []boldViaSegment {
	var segments []boldViaSegment
	start := -1
	for i := 0; i < len(names)-1; i++ {
		from, okFrom := g.GetID(names[i])
		to, okTo := g.GetID(names[i+1])
		bold := false
		if okFrom && okTo {
			for _, edge := range g.GetEdges(from) {
				if edge.ToID == to && edge.IsBoldLineArea {
					bold = true
					break
				}
			}
		}
		if bold && start < 0 {
			start = i
		} else if !bold && start >= 0 {
			segments = append(segments, boldViaSegment{start, i})
			start = -1
		}
	}
	if start >= 0 {
		segments = append(segments, boldViaSegment{start, len(names) - 1})
	}
	return segments
}

// 折り返し特例の片道区間（分岐駅から新幹線との接続駅まで）。
// 入力経路では在来線で通る側だけを照合し、両方向に対応する。
type overlapViaRule struct {
	branch                []string
	shinkansenNeighbor    string
	conventionalNeighbors []string
}

var overlapViaBranches = []overlapViaRule{
	{branch: []string{"羽前千歳", "北山形", "山形"}, shinkansenNeighbor: "かみのやま温泉", conventionalNeighbors: []string{"楯山"}},
	{branch: []string{"北山形", "山形"}, shinkansenNeighbor: "かみのやま温泉", conventionalNeighbors: []string{"東金井"}},
	{branch: []string{"安積永盛", "（北）郡山"}, shinkansenNeighbor: "新白河", conventionalNeighbors: []string{"磐城守山"}},
	{branch: []string{"宮内", "長岡"}, shinkansenNeighbor: "浦佐", conventionalNeighbors: []string{"前川", "越後滝谷"}},
	{branch: []string{"宝積寺", "岡本", "宇都宮"}, shinkansenNeighbor: "那須塩原", conventionalNeighbors: []string{"下野花岡"}},
	{branch: []string{"神田", "東京"}, shinkansenNeighbor: "上野", conventionalNeighbors: []string{"御茶ノ水"}},
	{branch: []string{"（中）金山", "尾頭橋", "名古屋"}, shinkansenNeighbor: "三河安城", conventionalNeighbors: []string{"鶴舞"}},
	{branch: []string{"山科", "京都"}, shinkansenNeighbor: "米原", conventionalNeighbors: []string{"大津京"}},
	{branch: []string{"東岡山", "高島", "西川原", "岡山"}, shinkansenNeighbor: "相生", conventionalNeighbors: []string{"大多羅"}},
	{branch: []string{"倉敷", "中庄", "庭瀬", "北長瀬", "岡山"}, shinkansenNeighbor: "新倉敷", conventionalNeighbors: []string{"清音"}},
	{branch: []string{"浦上", "長崎"}, shinkansenNeighbor: "諫早", conventionalNeighbors: []string{"西浦上"}},
	{branch: []string{"宇土", "富合", "川尻", "西熊本", "熊本"}, shinkansenNeighbor: "新八代", conventionalNeighbors: []string{"緑川"}},
	{branch: []string{"日暮里", "鶯谷", "上野"}, shinkansenNeighbor: "大宮", conventionalNeighbors: []string{"三河島"}},
	{branch: []string{"吉塚", "博多"}, shinkansenNeighbor: "小倉", conventionalNeighbors: []string{"柚須"}},
	{branch: []string{"西小倉", "小倉"}, shinkansenNeighbor: "博多", conventionalNeighbors: []string{"南小倉"}},
}

func containsStation(stations []string, station string) bool {
	for _, candidate := range stations {
		if candidate == station {
			return true
		}
	}
	return false
}

func removeOverlapVia(path []ViaStep) []ViaStep {
	result, _ := removeOverlapViaWithSuppression(path)
	return result
}

func removeOverlapViaWithSuppression(path []ViaStep) ([]ViaStep, map[string]bool) {
	result := append([]ViaStep(nil), path...)
	removed := make([]bool, len(path))
	suppressedStations := make(map[string]bool)
	for i := 0; i < len(path); i++ {
		for _, rule := range overlapViaBranches {
			branch := rule.branch
			if len(branch) > len(path)-i || i == 0 || i+len(branch) >= len(path) {
				continue
			}
			last := i + len(branch) - 1
			forward, backward := true, true
			for j, station := range branch {
				forward = forward && path[i+j].StationName == station
				backward = backward && path[i+j].StationName == branch[len(branch)-1-j]
			}
			conventional := true
			for j := i; j < last; j++ {
				if shinkansenLines[path[j].LineName] {
					conventional = false
					break
				}
			}
			if !conventional {
				continue
			}
			if forward && path[last+1].StationName == rule.shinkansenNeighbor && containsStation(rule.conventionalNeighbors, path[i-1].StationName) && !shinkansenLines[path[i-1].LineName] && shinkansenLines[path[last].LineName] &&
				path[i-1].StationName != branch[1] && path[last+1].StationName != branch[len(branch)-2] &&
				path[i-1].StationName != path[last+1].StationName {
				// 分岐駅から折り返し駅までの在来線を除き、新幹線のコードを分岐駅へ移す。
				result[i].LineName = path[last].LineName
				suppressedStations[path[i].StationName] = true
				for j := i + 1; j <= last; j++ {
					removed[j] = true
				}
				break
			}
			if backward && path[i-1].StationName == rule.shinkansenNeighbor && containsStation(rule.conventionalNeighbors, path[last+1].StationName) && shinkansenLines[path[i-1].LineName] && !shinkansenLines[path[last].LineName] &&
				path[i-1].StationName != branch[len(branch)-2] && path[last+1].StationName != branch[1] &&
				path[i-1].StationName != path[last+1].StationName {
				// 新幹線の終端駅から分岐駅までの折り返し区間を除く。
				suppressedStations[path[last].StationName] = true
				for j := i; j < last; j++ {
					removed[j] = true
				}
				break
			}
		}
	}
	trimmed := result[:0]
	for i, step := range result {
		if !removed[i] {
			trimmed = append(trimmed, step)
		}
	}
	return trimmed, suppressedStations
}

// GetFareViaForResult は計算結果に適用された特例ゾーン内の入力区間を省いて印字します。
// FinalPath はゾーン判定と境界駅の特定にだけ使い、路線コードは入力経路から取得します。
func GetFareViaForResult(path []ViaStep, finalPath []int, g graph.StationProvider, zones *graphio.SpecialZoneRegistry) []string {
	return getFareViaForResult(path, finalPath, g, zones, nil)
}

// GetFareViaForResultWithSections は通常モードの第69条・第70条の省略と第157条の置換を反映します。
func GetFareViaForResultWithSections(path []ViaStep, finalPath []int, g graph.Graph, zones *graphio.SpecialZoneRegistry) []string {
	return getFareViaForResult(path, finalPath, g, zones, g)
}

func getFareViaForResult(path []ViaStep, finalPath []int, g graph.StationProvider, zones *graphio.SpecialZoneRegistry, sectionGraph graph.Graph) []string {
	LogInputViaKanas(path)
	if len(path) < 2 || len(finalPath) < 2 {
		return getFareVia(path, true, true, nil)
	}

	start, end := 0, len(path)-1
	startZoneName := g.GetName(finalPath[0])
	endZoneName := g.GetName(finalPath[len(finalPath)-1])
	startBoundary := g.GetName(finalPath[1])
	endBoundary := g.GetName(finalPath[len(finalPath)-2])
	if zones != nil {
		if zone := zones.FindZoneByName(startZoneName); zone != nil {
			start = fareViaBoundary(path, zone.Stations, startBoundary, true)
		}
		if zone := zones.FindZoneByName(endZoneName); zone != nil {
			end = fareViaBoundary(path, zone.Stations, endBoundary, false)
		}
	}
	sourceNames := viaStepNames(path)
	osakaStart, osakaEnd := osakaShinOsakaViaBounds(sourceNames, finalPath, g)
	if osakaStart > start {
		start = osakaStart
	}
	if osakaEnd < end {
		end = osakaEnd
	}
	var rule157Sections []ruleViaSection
	if sectionGraph != nil {
		// 方面条件は市内区間の省略前に判定する。第88条の切り詰めで
		// 第157条(26)の大阪駅を失う場合は、置換区間を表示対象に残す。
		rule157Sections = findRule157ViaSections(sourceNames)
		for _, rule := range rule157Sections {
			if startZoneName == "大阪・新大阪" && rule.start == "大阪" && rule.startIndex < start && start <= rule.endIndex {
				start = rule.startIndex
			}
			if endZoneName == "大阪・新大阪" && rule.end == "大阪" && rule.startIndex <= end && end < rule.endIndex {
				end = rule.endIndex
			}
		}
	}
	if start > end {
		return getFareVia(path, true, true, nil)
	}
	trimmed := path[start : end+1]
	selected := inputSpecialViaOverrides(path)
	sections := viaSections{specialVia: selected}
	if sectionGraph != nil {
		names := viaStepNames(trimmed)
		sections = sectionsForPath(names, names, sectionGraph, selected, rule157Sections)
		sections.specialVia = selected
	}
	printPath, suppressedStations := removeOverlapViaWithSuppression(trimmed)
	return getFareViaWithSections(printPath, !isTokyoZone(startZoneName), !isTokyoZone(endZoneName), suppressedStations, sections)
}

func viaStepNames(path []ViaStep) []string {
	names := make([]string, len(path))
	for i, step := range path {
		names[i] = step.StationName
	}
	return names
}

func osakaShinOsakaViaBounds(names []string, finalPath []int, g graph.StationProvider) (int, int) {
	start, end := 0, len(names)-1
	if len(names) == 0 || len(finalPath) == 0 {
		return start, end
	}
	loadViaData()
	zone := viaData.zoneRoutes["大阪・新大阪"]
	if len(zone) == 0 {
		return start, end
	}
	stations := make([]string, 0, len(zone))
	for station := range zone {
		stations = append(stations, station)
	}
	if g.GetName(finalPath[0]) == "大阪・新大阪" {
		if names[0] == "大阪・新大阪" && len(names) > 1 {
			start = 1
		}
		start += fareViaBoundaryNames(names[start:], stations, true)
	}
	if g.GetName(finalPath[len(finalPath)-1]) == "大阪・新大阪" {
		if names[end] == "大阪・新大阪" && end > 0 {
			end--
		}
		end = fareViaBoundaryNames(names[:end+1], stations, false)
	}
	return start, end
}

func fareViaBoundaryNames(names, stations []string, origin bool) int {
	inside := make(map[string]bool, len(stations))
	for _, station := range stations {
		inside[station] = true
	}
	if origin {
		i := 0
		if !inside[names[i]] {
			return i
		}
		for i < len(names)-1 && inside[names[i+1]] {
			i++
		}
		return i
	}
	i := len(names) - 1
	if !inside[names[i]] {
		return i
	}
	for i > 0 && inside[names[i-1]] {
		i--
	}
	return i
}

func isTokyoZone(name string) bool {
	return name == "東京都区内" || name == "東京山手線内"
}

// fareViaBoundary はゾーン側の境界駅の入力経路上の位置を返します。
// 事後補正で隣接駅が置換されている場合は、入力側の連続したゾーン区間を使います。
func fareViaBoundary(path []ViaStep, stations []string, resultBoundary string, origin bool) int {
	inside := make(map[string]bool, len(stations))
	for _, station := range stations {
		inside[station] = true
	}
	if inside[resultBoundary] {
		for i, step := range path {
			if step.StationName == resultBoundary {
				return i
			}
		}
	}
	if origin {
		i := 0
		for i < len(path)-1 && inside[path[i+1].StationName] {
			i++
		}
		return i
	}
	i := len(path) - 1
	for i > 0 && inside[path[i-1].StationName] {
		i--
	}
	return i
}

// GetCalculatedFareVia は近郊区間内完結時の通常・最安を同じ駅列印字へ振り分けます。
func GetCalculatedFareVia(mode string, input []ViaStep, sourcePath, printPath, finalPath []int, g graph.Graph, zones *graphio.SpecialZoneRegistry) []string {
	if mode != "uncorrect" && IsSuburbanAreaComplete(sourcePath, g) {
		LogAutomaticViaKanas(g, printPath)
		return GetAutomaticFareViaForResult(g, printPath, finalPath)
	}
	switch mode {
	case "cheapest":
		LogInputViaKanas(input)
		return GetAutomaticFareViaForResult(g, printPath, finalPath)
	case "uncorrect":
		return GetFareViaForResult(input, finalPath, g, zones)
	default:
		return GetFareViaForResultWithSections(input, finalPath, g, zones)
	}
}

func automaticViaKanas(g graph.Graph, path []int) []string {
	steps := cheapestViaSteps(g, path)
	// 仮想ゾーンを除き、市内の切り詰めや印字省略を適用する前のコードを返す。
	for len(steps) > 0 && len(viaData.zoneRoutes[steps[0].StationName]) > 0 {
		steps = steps[1:]
	}
	for len(steps) > 0 && len(viaData.zoneRoutes[steps[len(steps)-1].StationName]) > 0 {
		steps = steps[:len(steps)-1]
	}
	return viaKanas(steps, automaticSpecialViaOverrides(steps, steps))
}

// LogAutomaticViaKanas は補正後の駅列を自動案内の特殊経由線コードで表示します。
func LogAutomaticViaKanas(g graph.Graph, path []int) {
	encoded, _ := json.Marshal(automaticViaKanas(g, path))
	fmt.Printf("カナコード：%s\n", encoded)
}

// GetSplitVia は分割区間の駅間を edges.json の路線へ戻して印字します。
func GetSplitVia(g graph.StationProvider, path []int) []string {
	return getSplitVia(g, path, viaSections{})
}

// GetSplitViaForResult は補正前の探索経路から第69条・第70条・第157条を判定して印字します。
func GetSplitViaForResult(g graph.Graph, sourcePath, printPath []int) []string {
	return getSplitViaForResult(g, sourcePath, printPath)
}

// GetCheapestFareViaForResult は延長・補正後の経路だけで最安モードの印字を判定します。
func GetCheapestFareViaForResult(g graph.Graph, printPath, finalPath []int) []string {
	return GetAutomaticFareViaForResult(g, printPath, finalPath)
}

// GetAutomaticFareViaForResult は計算済みの駅列だけから経路自動案内の印字を生成します。
func GetAutomaticFareViaForResult(g graph.Graph, printPath, finalPath []int) []string {
	steps := cheapestViaSteps(g, printPath)
	names := viaStepNames(steps)
	start, end := osakaShinOsakaViaBounds(names, finalPath, g)
	if start > end {
		return []string{}
	}
	steps = steps[start : end+1]
	// 特例ゾーンは仮想駅なので、駅間の復元と接続駅印字から除く。
	for len(steps) > 0 && len(viaData.zoneRoutes[steps[0].StationName]) > 0 {
		steps = steps[1:]
	}
	for len(steps) > 0 && len(viaData.zoneRoutes[steps[len(steps)-1].StationName]) > 0 {
		steps = steps[:len(steps)-1]
	}
	if len(steps) < 2 {
		return []string{}
	}
	names = viaStepNames(steps)
	selected := automaticSpecialViaOverrides(steps, steps)
	sections := sectionsForPath(names, names, g, selected, findRule157ViaSections(names))
	sections.specialVia = selected
	printStart, printEnd := true, true
	if len(finalPath) > 0 {
		printStart = !isTokyoZone(g.GetName(finalPath[0]))
		printEnd = !isTokyoZone(g.GetName(finalPath[len(finalPath)-1]))
	}
	return getFareViaWithSections(steps, printStart, printEnd, nil, sections)
}

func getSplitViaForResult(g graph.Graph, sourcePath, printPath []int) []string {
	sourceNames := make([]string, len(sourcePath))
	for i, id := range sourcePath {
		sourceNames[i] = g.GetName(id)
	}
	printNames := make([]string, len(printPath))
	for i, id := range printPath {
		printNames[i] = g.GetName(id)
	}
	selected := automaticSpecialViaOverrides(physicalViaSteps(g, sourcePath), physicalViaSteps(g, printPath))
	sections := sectionsForPath(sourceNames, printNames, g, selected, findRule157ViaSections(sourceNames))
	sections.specialVia = selected
	return getSplitVia(g, printPath, sections)
}

func physicalViaSteps(g graph.StationProvider, path []int) []ViaStep {
	loadViaData()
	steps := make([]ViaStep, len(path))
	for i, id := range path {
		steps[i].StationName = g.GetName(id)
		if i+1 < len(path) {
			steps[i].LineName = viaData.physicalLineByPair[stationPair(steps[i].StationName, g.GetName(path[i+1]))]
		}
	}
	return steps
}

func getSplitVia(g graph.StationProvider, path []int, sections viaSections) []string {
	printer := viaPrinter{}
	if len(path) < 2 {
		return printer.render()
	}
	loadViaData()
	if sections.specialVia == nil {
		steps := physicalViaSteps(g, path)
		sections.specialVia = automaticSpecialViaOverrides(steps, steps)
	}
	for i := 0; i < len(path)-1; i++ {
		station := g.GetName(path[i])
		nextStation := g.GetName(path[i+1])
		pair := stationPair(station, nextStation)
		if codes := sections.replacements[station]; len(codes) > 0 {
			appendViaReplacement(&printer, codes)
		}
		if sections.omitted[pair] {
			printer.previousLine = sections.replacementLineByEdge[pair]
			continue
		}
		line := viaData.physicalLineByPair[pair]
		printer.addSelectedLine(station, nextStation, line, sections.specialVia[pair])
	}
	return printer.render()
}
