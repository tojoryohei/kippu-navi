package main

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
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
