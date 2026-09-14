package main

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
	"reflect"
	"testing"
)

func addTestEdge(g *graph.RailwayGraph, from, to string, eigyo domain.DeciKilo, company domain.CompanyID) {
	a := g.GetOrAddID(from)
	b := g.GetOrAddID(to)
	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: a, ToID: b, EigyoKilo: eigyo, GiseiKilo: eigyo, Company: company, SuburbanArea: domain.SuburbanAreaTokyo}})
	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: b, ToID: a, EigyoKilo: eigyo, GiseiKilo: eigyo, Company: company, SuburbanArea: domain.SuburbanAreaTokyo}})
}

func TestScanZoneFindsExactAndOverBoundaryWithoutCycle(t *testing.T) {
	g := graph.NewGraph(8)
	addTestEdge(g, "名古屋", "A", 1000, domain.JRCentral)
	addTestEdge(g, "名古屋", "B", 2000, domain.JRCentral)
	addTestEdge(g, "B", "C", 1, domain.JRCentral)
	// 私鉄と仮想駅に相当する辺は探索対象から除外されます。
	addTestEdge(g, "C", "私鉄駅", 1, domain.Other)
	zone := ticketdomain.SpecialZone{Name: "名古屋市内", MinDistanceDeciKilo: 2000, MaxDistanceDeciKilo: 1 << 30, Stations: []string{"A"}}
	data := &scanData{
		physical: g,
		full:     g,
		zones:    &ticketgraphio.SpecialZoneRegistry{Zones: []ticketdomain.SpecialZone{zone}},
		routes:   ticketdomain.ZoneRoutes{"名古屋市内": {"A": {"名古屋", "A"}}},
	}
	stats := &scanStats{PerZone: make(map[string]zoneStats)}
	var got []article114Candidate
	data.scanZone(zone, stats, func(c article114Candidate) { got = append(got, c) })
	if len(got) == 0 {
		t.Fatal("200.0kmを超える隣接駅の候補が見つかりません")
	}
	for _, c := range got {
		if c.centerBEigyo != 2000 || c.centerCEigyo != 2001 {
			t.Fatalf("境界距離が不正: B=%d C=%d", c.centerBEigyo, c.centerCEigyo)
		}
		if c.boundaryName != "B" || c.outsideName != "C" {
			t.Fatalf("隣接境界が不正: %s -> %s", c.boundaryName, c.outsideName)
		}
	}
}

func TestDominatesUsesDistanceOnlyWithinFareState(t *testing.T) {
	a := &routeLabel{centerEigyo: 100, centerGisei: 100, eigyo: 100, gisei: 100}
	b := &routeLabel{centerEigyo: 101, centerGisei: 100, eigyo: 100, gisei: 100}
	if !dominates(a, b) || dominates(b, a) {
		t.Fatal("距離の非劣解判定が不正です")
	}
	b.state.hasLocal = true
	keyA := frontierKey{station: 1, state: a.state}
	keyB := frontierKey{station: 1, state: b.state}
	if keyA == keyB {
		t.Fatal("会社・線区状態がフロンティアキーに反映されていません")
	}
}

func TestPathMetricsRejectsPrivateEdge(t *testing.T) {
	g := graph.NewGraph(4)
	addTestEdge(g, "A", "B", 10, domain.Other)
	if _, _, err := pathMetrics(g, []int{g.GetOrAddID("A"), g.GetOrAddID("B")}); err == nil {
		t.Fatal("私鉄エッジをJR物理経路として受け入れています")
	}
}

func TestStationInZoneUsesArticle70ForYamanote(t *testing.T) {
	if !stationInZone(ticketdomain.SpecialZone{Name: "東京山手線内", Stations: []string{"東京"}}, "新宿") {
		t.Fatal("東京山手線内の第70条駅判定に失敗しました")
	}
	if stationInZone(ticketdomain.SpecialZone{Name: "東京山手線内", Stations: []string{"東京"}}, "中野") {
		t.Fatal("第70条対象外駅を東京山手線内として判定しました")
	}
}

func TestScanZoneRequiresOriginToCenterPhysicalRoute(t *testing.T) {
	g := graph.NewGraph(8)
	addTestEdge(g, "名古屋", "A", 10, domain.JRCentral)
	addTestEdge(g, "A", "B", 2000, domain.JRCentral)
	addTestEdge(g, "B", "C", 1, domain.JRCentral)
	zone := ticketdomain.SpecialZone{Name: "名古屋市内", MinDistanceDeciKilo: 2000, MaxDistanceDeciKilo: 1 << 30, Stations: []string{"A"}}
	data := &scanData{
		physical: g,
		full:     g,
		zones:    &ticketgraphio.SpecialZoneRegistry{Zones: []ticketdomain.SpecialZone{zone}},
		routes:   ticketdomain.ZoneRoutes{"名古屋市内": {"A": {"名古屋", "A"}}},
	}
	stats := &scanStats{PerZone: make(map[string]zoneStats)}
	var got []article114Candidate
	data.scanZone(zone, stats, func(c article114Candidate) { got = append(got, c) })
	if len(got) != 0 {
		t.Fatalf("中心駅を通らない経路を第114条候補として扱いました: %d件", len(got))
	}
}

type recordingCandidateEvaluator struct {
	modes []string
}

func (e *recordingCandidateEvaluator) ExecuteWithMode(_ []int, _ int, mode string) (*ticketusecase.CalculationResult, []int, error) {
	e.modes = append(e.modes, mode)
	return &ticketusecase.CalculationResult{Fare: 100}, nil, nil
}

func TestEvaluateCandidateUsesUncorrectMode(t *testing.T) {
	current := &recordingCandidateEvaluator{}
	raw := &recordingCandidateEvaluator{}
	data := &scanData{current: current, raw: raw}
	candidate := &article114Candidate{
		pathAB: []int{1, 2},
		pathAC: []int{1, 2, 3},
	}
	evaluateCandidate(data, candidate)
	if candidate.classification != classificationNone {
		t.Fatalf("候補分類が不正です: %s", candidate.classification)
	}
	for _, mode := range append(current.modes, raw.modes...) {
		if mode != "uncorrect" {
			t.Fatalf("第114条評価に補正禁止以外のモードが使われました: %s", mode)
		}
	}
	if len(current.modes)+len(raw.modes) != 4 {
		t.Fatalf("評価回数が不正です: current=%d raw=%d", len(current.modes), len(raw.modes))
	}
}

func TestIsApplicableCandidate(t *testing.T) {
	for _, classification := range []string{classificationUncovered, classificationCovered} {
		if !isApplicableCandidate(article114Candidate{classification: classification}) {
			t.Fatalf("適用対象の分類を除外しました: %s", classification)
		}
	}
	for _, classification := range []string{classificationNone, classificationError, ""} {
		if isApplicableCandidate(article114Candidate{classification: classification}) {
			t.Fatalf("適用対象外の分類を出力対象にしました: %s", classification)
		}
	}
}

func TestArticle114RegressionRoutes(t *testing.T) {
	data, err := newScanData()
	if err != nil {
		t.Fatalf("実データの初期化に失敗しました: %v", err)
	}
	var sapporo ticketdomain.SpecialZone
	for _, zone := range data.zones.Zones {
		switch zone.Name {
		case "札幌市内":
			sapporo = zone
		}
	}
	sapporoStats := &scanStats{PerZone: make(map[string]zoneStats)}
	foundHoshimi := false
	data.scanZoneWithFilter(sapporo, sapporoStats, func(name string) bool { return name == "ほしみ" }, func(c article114Candidate) {
		if c.boundaryName != "南永山" || c.outsideName != "東旭川" || c.centerBEigyo != 1991 || c.centerCEigyo != 2018 {
			return
		}
		if !containsSubsequence(data.full, c.pathAB, []string{"ほしみ", "札幌", "滝川", "富良野", "旭川", "新旭川", "南永山"}) {
			return
		}
		evaluateCandidate(data, &c)
		if c.classification == classificationUncovered && c.rawAB == 5170 && c.rawXC == 4840 && c.currentAB == 5170 && c.currentXC == 4840 {
			foundHoshimi = true
			selected, err := ticketusecase.SelectCheapestPathWithRouteExtensions(c.pathAB, data.full, nil, nil, data.zones, func(candidate []int) (int, error) {
				result, _, evalErr := data.current.ExecuteWithMode(candidate, 0, "normal")
				if evalErr != nil {
					return 0, evalErr
				}
				return result.TotalAmount(), nil
			})
			if err != nil {
				t.Errorf("ほしみ経路の最安逐次延長に失敗しました: %v", err)
				return
			}
			if len(selected) == 0 || data.full.GetName(selected[len(selected)-1]) != "東旭川" {
				t.Errorf("ほしみ経路の最安逐次延長先が不正です: %s", data.full.GetName(selected[len(selected)-1]))
				return
			}
			result, _, err := data.current.ExecuteWithMode(selected, 0, "normal")
			if err != nil || result.TotalAmount() != 4840 {
				t.Errorf("ほしみ経路の最安運賃が不正です: fare=%d err=%v", result.TotalAmount(), err)
			}
		}
	})
	if !foundHoshimi {
		t.Fatal("ほしみ→札幌→滝川→富良野→旭川→南永山→東旭川の候補が見つかりません")
	}

	refs := data.adjustedFareReferences()
	want := map[string]bool{
		"熊ケ根→笈川":   false,
		"作並→堂島":    false,
		"作並→笈川":    false,
		"奥新川→会津若松": false,
		"奥新川→堂島":   false,
		"奥新川→笈川":   false,
	}
	for _, c := range refs {
		key := c.originName + "→" + c.boundaryName
		if _, ok := want[key]; ok && c.adjustedMatch {
			evaluateAdjustedFareReference(data, &c)
			if c.classification == classificationCovered && c.currentAB == c.registeredFare {
				want[key] = true
			} else if c.classification == classificationCovered {
				t.Errorf("調整運賃の登録値と評価値が一致しません: %s: 登録=%d 評価=%d", key, c.registeredFare, c.currentAB)
			}
		}
	}
	for key, ok := range want {
		if !ok {
			t.Errorf("既存調整運賃経路が検証行に含まれていません: %s", key)
		}
	}
}

func TestCheapestShapeRegressionRoutes(t *testing.T) {
	data, err := newScanData()
	if err != nil {
		t.Fatalf("実データの初期化に失敗しました: %v", err)
	}
	names := []string{
		"奥新川", "作並", "熊ケ根", "陸前白沢", "愛子", "陸前落合", "葛岡", "国見", "東北福祉大前", "北山", "北仙台", "東照宮", "仙台",
		"榴ケ岡", "宮城野原", "陸前原ノ町", "苦竹", "小鶴新田", "福田町", "陸前高砂", "中野栄", "多賀城", "下馬", "西塩釜", "本塩釜", "東塩釜", "陸前浜田", "松島海岸", "高城町", "手樽", "陸前富山", "陸前大塚", "東名", "野蒜", "陸前小野", "鹿妻", "矢本", "東矢本", "陸前赤井", "石巻あゆみ野", "蛇田", "陸前山下", "石巻",
		"曽波神", "鹿又", "佳景山", "前谷地", "涌谷", "上涌谷", "小牛田",
		"田尻", "瀬峰", "梅ケ沢", "（北）新田", "石越", "油島", "花泉", "清水原", "有壁", "一ノ関", "山ノ目", "平泉", "前沢", "陸中折居", "水沢", "金ケ崎", "六原", "北上",
		"新花巻", "似内", "花巻", "村崎野",
	}
	path := make([]int, len(names))
	for i, name := range names {
		id, ok := data.full.GetID(name)
		if !ok {
			t.Fatalf("駅が見つかりません: %s", name)
		}
		path[i] = id
	}

	fareEval := func(candidate []int) (int, error) {
		result, _, evalErr := data.current.ExecuteWithMode(candidate, 0, "normal")
		if evalErr != nil {
			return 0, evalErr
		}
		return result.TotalAmount(), nil
	}
	selected, err := ticketusecase.SelectCheapestPathWithRouteExtensions(path, data.full, nil, nil, data.zones, fareEval)
	if err != nil {
		t.Fatalf("順方向の最安経路計算に失敗しました: %v", err)
	}
	forwardResult, _, err := data.current.ExecuteWithMode(selected, 0, "normal")
	if err != nil {
		t.Fatalf("順方向の選択経路評価に失敗しました: %v", err)
	}
	wantForward := append(append([]int(nil), path...), data.full.GetOrAddID("北上"))
	if !reflect.DeepEqual(selected, wantForward) || forwardResult.TotalAmount() != 3850 {
		t.Fatalf("6の字経路の選択結果が不正です: fare=%d path=%v", forwardResult.TotalAmount(), selected)
	}

	reverse := append([]int(nil), path...)
	for i, j := 0, len(reverse)-1; i < j; i, j = i+1, j-1 {
		reverse[i], reverse[j] = reverse[j], reverse[i]
	}
	selected, err = ticketusecase.SelectCheapestPathWithRouteExtensions(reverse, data.full, nil, nil, data.zones, fareEval)
	if err != nil {
		t.Fatalf("逆方向の最安経路計算に失敗しました: %v", err)
	}
	reverseResult, _, err := data.current.ExecuteWithMode(selected, 0, "normal")
	if err != nil {
		t.Fatalf("逆方向の選択経路評価に失敗しました: %v", err)
	}
	if !reflect.DeepEqual(selected, reverse) || reverseResult.TotalAmount() != 4180 {
		t.Fatalf("9の字経路の除外結果が不正です: fare=%d path=%v", reverseResult.TotalAmount(), selected)
	}
}

func containsSubsequence(g graph.Graph, path []int, names []string) bool {
	if len(names) == 0 {
		return true
	}
	nameIndex := 0
	for _, id := range path {
		if g.GetName(id) == names[nameIndex] {
			nameIndex++
			if nameIndex == len(names) {
				return true
			}
		}
	}
	return false
}
