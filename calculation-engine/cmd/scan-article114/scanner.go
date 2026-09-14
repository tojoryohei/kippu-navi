package main

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
	"container/heap"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"slices"
	"strings"
	"time"
)

const (
	classificationUncovered = "uncovered_114"
	classificationCovered   = "covered_by_adjusted_fare"
	classificationNone      = "not_applicable"
	classificationError     = "evaluation_error"
)

type scanOptions struct {
	CSVPath        string
	JSONPath       string
	ApplicableOnly bool
}

type scanData struct {
	physical         *graph.RailwayGraph
	full             *graph.RailwayGraph
	zones            *ticketgraphio.SpecialZoneRegistry
	routes           ticketdomain.ZoneRoutes
	current          candidateEvaluator
	raw              candidateEvaluator
	specificMatcher  *fare.PathMatcher
	currentAdjusted  *fare.PathMatcher
	adjustedRoutes   map[string]struct{}
	adjustedFares    []ticketdomain.PathAndFare
	dataHashes       map[string]string
	currentFareCache map[string]fareEvaluation
	rawFareCache     map[string]fareEvaluation
}

type fareEvaluation struct {
	amount int
	err    error
}

type routeLabel struct {
	path        []int
	centerPath  []int
	seen        map[int]struct{}
	eigyo       domain.DeciKilo
	gisei       domain.DeciKilo
	centerEigyo domain.DeciKilo
	centerGisei domain.DeciKilo
	state       labelState
	dominated   bool
}

type labelState struct {
	hasTrunk  bool
	hasLocal  bool
	companies [domain.CompanyCount]companyState
	specific  bool
	adjusted  bool
}

// companyState は会社別の運賃計算に影響する状態だけを保持します。
// 営業キロ・擬制キロはラベル本体で比較するため、状態キーには含めません。
type companyState struct {
	used  bool
	trunk bool
	local bool
}

type frontierKey struct {
	// 閾値をまたぐ候補は、同じ駅に着く短い経路が長い経路を
	// 安全に置き換えられない場合があります。4つの距離指標と
	// 運賃状態をキーにして、同一ラベルだけを重複排除します。
	station     int
	state       labelState
	eigyo       domain.DeciKilo
	gisei       domain.DeciKilo
	centerEigyo domain.DeciKilo
	centerGisei domain.DeciKilo
}

type article114Candidate struct {
	source               string
	zoneName             string
	centerName           string
	originName           string
	boundaryName         string
	outsideName          string
	direction            string
	threshold            domain.DeciKilo
	centerBEigyo         domain.DeciKilo
	centerCEigyo         domain.DeciKilo
	centerBGisei         domain.DeciKilo
	centerCGisei         domain.DeciKilo
	abEigyo              domain.DeciKilo
	abGisei              domain.DeciKilo
	pathAB               []int
	pathAC               []int
	centerPathC          []int
	rawAB, rawXC         int
	currentAB, currentXC int
	registeredFare       int
	classification       string
	adjustedMatch        bool
	errorMessage         string
}

type candidateEvaluator interface {
	ExecuteWithMode([]int, int, string) (*ticketusecase.CalculationResult, []int, error)
}

type scanStats struct {
	StartedAt        time.Time            `json:"startedAt"`
	FinishedAt       time.Time            `json:"finishedAt"`
	DurationMillis   int64                `json:"durationMillis"`
	Zones            int                  `json:"zones"`
	Starts           int                  `json:"starts"`
	LabelsGenerated  int64                `json:"labelsGenerated"`
	LabelsPruned     int64                `json:"labelsPruned"`
	Candidates       int                  `json:"candidates"`
	OutputCandidates int                  `json:"outputCandidates"`
	Uncovered        int                  `json:"uncovered114"`
	Covered          int                  `json:"coveredByAdjustedFare"`
	NotApplicable    int                  `json:"notApplicable"`
	EvaluationError  int                  `json:"evaluationErrors"`
	PerZone          map[string]zoneStats `json:"perZone"`
	DataHashes       map[string]string    `json:"dataHashes"`
	CSVPath          string               `json:"csvPath"`
	JSONPath         string               `json:"jsonPath"`
	CandidateRows    []map[string]any     `json:"candidateRows,omitempty"`
}

type zoneStats struct {
	Starts           int `json:"starts"`
	Candidates       int `json:"candidates"`
	OutputCandidates int `json:"outputCandidates"`
	Uncovered        int `json:"uncovered114"`
	Covered          int `json:"coveredByAdjustedFare"`
	NotApplicable    int `json:"notApplicable"`
	EvaluationError  int `json:"evaluationErrors"`
}

type labelQueue []*routeLabel

func (q labelQueue) Len() int { return len(q) }
func (q labelQueue) Less(i, j int) bool {
	if q[i].centerEigyo != q[j].centerEigyo {
		return q[i].centerEigyo < q[j].centerEigyo
	}
	return q[i].centerGisei < q[j].centerGisei
}
func (q labelQueue) Swap(i, j int) { q[i], q[j] = q[j], q[i] }
func (q *labelQueue) Push(x any)   { *q = append(*q, x.(*routeLabel)) }
func (q *labelQueue) Pop() any {
	old := *q
	n := len(old)
	x := old[n-1]
	*q = old[:n-1]
	return x
}

func isJRPhysical(edge ticketdomain.TicketEdge) bool {
	return edge.Company != domain.Other
}

func edgeFor(g graph.TopologyProvider, from, to int) *ticketdomain.TicketEdge {
	for _, e := range g.GetEdges(from) {
		if e.ToID == to && isJRPhysical(e) {
			copy := e
			return &copy
		}
	}
	return nil
}

func pathMetrics(g graph.TopologyProvider, path []int) (domain.DeciKilo, domain.DeciKilo, error) {
	var eigyo, gisei domain.DeciKilo
	if len(path) < 1 {
		return 0, 0, errors.New("空の経路")
	}
	for i := 0; i+1 < len(path); i++ {
		e := edgeFor(g, path[i], path[i+1])
		if e == nil {
			return 0, 0, fmt.Errorf("経路が見つかりません: %d -> %d", path[i], path[i+1])
		}
		eigyo += e.EigyoKilo
		gisei += e.GiseiKilo
	}
	return eigyo, gisei, nil
}

func appendUnique(path []int, id int) []int {
	if len(path) > 0 && path[len(path)-1] == id {
		return path
	}
	return append(append([]int(nil), path...), id)
}

func reversePath(path []int) []int {
	out := append([]int(nil), path...)
	slices.Reverse(out)
	return out
}

// shortestJRPath is used only when zone_routes.json does not contain a route
// for a zone member. It uses the same physical JR graph and preserves both
// distance metrics for the scanner's labels.
func shortestJRPath(g *graph.RailwayGraph, start, goal int) ([]int, domain.DeciKilo, domain.DeciKilo, bool) {
	if start == goal {
		return []int{start}, 0, 0, true
	}
	n := g.NumStations()
	if start < 0 || goal < 0 || start >= n || goal >= n {
		return nil, 0, 0, false
	}
	// A local heap avoids changing the production graph API.
	var h shortestQueue
	heap.Init(&h)
	dist := make([]domain.DeciKilo, n)
	eigyo := make([]domain.DeciKilo, n)
	prev := make([]int, n)
	for i := range dist {
		dist[i] = -1
		prev[i] = -1
	}
	dist[start] = 0
	heap.Push(&h, &shortestNode{id: start, cost: 0})
	for h.Len() > 0 {
		u := heap.Pop(&h).(*shortestNode)
		if dist[u.id] != u.cost {
			continue
		}
		if u.id == goal {
			break
		}
		for _, e := range g.GetEdges(u.id) {
			if !isJRPhysical(e) {
				continue
			}
			alt := u.cost + e.GiseiKilo
			if dist[e.ToID] == -1 || alt < dist[e.ToID] {
				dist[e.ToID] = alt
				eigyo[e.ToID] = eigyo[u.id] + e.EigyoKilo
				prev[e.ToID] = u.id
				heap.Push(&h, &shortestNode{id: e.ToID, cost: alt})
			}
		}
	}
	if dist[goal] < 0 {
		return nil, 0, 0, false
	}
	path := make([]int, 0)
	for id := goal; id >= 0; id = prev[id] {
		path = append(path, id)
	}
	slices.Reverse(path)
	return path, eigyo[goal], dist[goal], true
}

type shortestNode struct {
	id    int
	cost  domain.DeciKilo
	index int
}
type shortestQueue []*shortestNode

func (q shortestQueue) Len() int           { return len(q) }
func (q shortestQueue) Less(i, j int) bool { return q[i].cost < q[j].cost }
func (q shortestQueue) Swap(i, j int)      { q[i], q[j] = q[j], q[i] }
func (q *shortestQueue) Push(x any) {
	n := len(*q)
	x.(*shortestNode).index = n
	*q = append(*q, x.(*shortestNode))
}
func (q *shortestQueue) Pop() any { old := *q; n := len(old); x := old[n-1]; *q = old[:n-1]; return x }

func centerRoute(data *scanData, zone ticketdomain.SpecialZone, centerID, stationID int) ([]int, domain.DeciKilo, domain.DeciKilo, bool) {
	if centerID == stationID {
		return []int{centerID}, 0, 0, true
	}
	name := data.full.GetName(stationID)
	if names := data.routes.GetRoute(zone.Name, name); len(names) > 0 {
		ids := make([]int, 0, len(names))
		for _, n := range names {
			id, ok := data.full.GetID(n)
			if !ok {
				ids = nil
				break
			}
			ids = append(ids, id)
		}
		if len(ids) > 1 {
			if e, g, err := pathMetrics(data.physical, ids); err == nil {
				return ids, e, g, true
			}
		}
	}
	return shortestJRPath(data.physical, centerID, stationID)
}

func stationInZone(zone ticketdomain.SpecialZone, name string) bool {
	if zone.Name == "東京山手線内" {
		return ticketdomain.IsArticle70Station(name)
	}
	for _, s := range zone.Stations {
		if s == name {
			return true
		}
	}
	return false
}

func maxPhysicalEigyo(g *graph.RailwayGraph) domain.DeciKilo {
	var max domain.DeciKilo
	for i := 0; i < g.NumStations(); i++ {
		for _, e := range g.GetEdges(i) {
			if isJRPhysical(e) && e.EigyoKilo > max {
				max = e.EigyoKilo
			}
		}
	}
	return max
}

func stateForPath(g graph.TopologyProvider, path []int, specific, adjusted *fare.PathMatcher) labelState {
	var st labelState
	for i := 0; i+1 < len(path); i++ {
		e := edgeFor(g, path[i], path[i+1])
		if e == nil {
			continue
		}
		if e.IsLocal {
			st.hasLocal = true
		} else {
			st.hasTrunk = true
		}
		if int(e.Company) >= 0 && int(e.Company) < len(st.companies) {
			c := &st.companies[e.Company]
			c.used = true
			if e.IsLocal {
				c.local = true
			} else {
				c.trunk = true
			}
		}
	}
	if specific != nil {
		_, st.specific = specific.Search(path)
	}
	if adjusted != nil {
		_, st.adjusted = adjusted.Search(path)
	}
	return st
}

func dominates(a, b *routeLabel) bool {
	return a.centerEigyo <= b.centerEigyo && a.centerGisei <= b.centerGisei && a.eigyo <= b.eigyo && a.gisei <= b.gisei &&
		(a.centerEigyo < b.centerEigyo || a.centerGisei < b.centerGisei || a.eigyo < b.eigyo || a.gisei < b.gisei)
}

func addFrontier(frontier map[frontierKey][]*routeLabel, label *routeLabel, stats *scanStats) bool {
	key := frontierKey{
		station:     label.path[len(label.path)-1],
		state:       label.state,
		eigyo:       label.eigyo,
		gisei:       label.gisei,
		centerEigyo: label.centerEigyo,
		centerGisei: label.centerGisei,
	}
	if _, exists := frontier[key]; exists {
		// 同じ距離・運賃状態なら、候補判定に必要な情報は同一です。
		stats.LabelsPruned++
		return false
	}
	frontier[key] = []*routeLabel{label}
	return true
}

func (data *scanData) scanZone(zone ticketdomain.SpecialZone, stats *scanStats, consume func(article114Candidate)) {
	data.scanZoneWithFilter(zone, stats, nil, consume)
}

func (data *scanData) scanZoneWithFilter(zone ticketdomain.SpecialZone, stats *scanStats, originFilter func(string) bool, consume func(article114Candidate)) {
	centerName, ok := ticketgraphio.ZoneCenterStations[zone.Name]
	if !ok && zone.Name == "東京山手線内" {
		centerName = "東京"
		ok = true
	}
	if !ok {
		return
	}
	centerID, ok := data.full.GetID(centerName)
	if !ok {
		return
	}
	threshold := domain.DeciKilo(2000)
	if zone.Name == "東京山手線内" {
		threshold = 1000
	}
	limit := threshold + maxPhysicalEigyo(data.physical)
	zoneStations := make(map[int]struct{})
	for _, name := range zone.Stations {
		id, ok := data.full.GetID(name)
		if !ok {
			continue
		}
		zoneStations[id] = struct{}{}
	}
	// Zone names are sometimes present in stations for data compatibility; they
	// are virtual and must never seed physical route exploration.
	for _, startID := range sortedIDs(zoneStations) {
		if startID < 0 || startID >= data.physical.NumStations() {
			continue
		}
		startName := data.full.GetName(startID)
		if originFilter != nil && !originFilter(startName) {
			continue
		}
		if startName == zone.Name || strings.HasSuffix(startName, "市内") || startName == "東京山手線内" {
			continue
		}
		if len(data.physical.GetEdges(startID)) == 0 {
			continue
		}
		centerPath, _, _, ok := centerRoute(data, zone, centerID, startID)
		if !ok {
			continue
		}
		stats.Starts++
		zs := stats.PerZone[zone.Name]
		zs.Starts++
		stats.PerZone[zone.Name] = zs
		// 第114条の候補は、発駅から中心駅へ向かう物理経路を含むものに
		// 限定します。中心駅到達後の距離だけを閾値判定に使うため、
		// 経路ラベルは A→中心駅 で初期化します。
		originToCenter := reversePath(centerPath)
		prefixEigyo, prefixGisei, err := pathMetrics(data.physical, originToCenter)
		if err != nil || len(originToCenter) == 0 || originToCenter[len(originToCenter)-1] != centerID {
			continue
		}
		seen := make(map[int]struct{}, len(originToCenter))
		for _, id := range originToCenter {
			seen[id] = struct{}{}
		}
		label := &routeLabel{
			path: originToCenter, centerPath: []int{centerID}, seen: seen,
			eigyo: prefixEigyo, gisei: prefixGisei,
			state: stateForPath(data.physical, originToCenter, data.specificMatcher, data.currentAdjusted),
		}
		queue := &labelQueue{label}
		heap.Init(queue)
		frontier := make(map[frontierKey][]*routeLabel)
		addFrontier(frontier, label, stats)
		for queue.Len() > 0 {
			current := heap.Pop(queue).(*routeLabel)
			if current.dominated {
				continue
			}
			if current.centerEigyo > limit {
				continue
			}
			stats.LabelsGenerated++
			currentID := current.path[len(current.path)-1]
			for _, edge := range data.physical.GetEdges(currentID) {
				if !isJRPhysical(edge) {
					continue
				}
				if _, seen := current.seen[edge.ToID]; seen {
					stats.LabelsPruned++
					continue
				}
				nextCenterEigyo := current.centerEigyo + edge.EigyoKilo
				nextCenterGisei := current.centerGisei + edge.GiseiKilo
				if nextCenterEigyo > limit {
					continue
				}
				nextPath := append(append([]int(nil), current.path...), edge.ToID)
				nextCenterPath := appendUnique(current.centerPath, edge.ToID)
				nextState := current.state
				if edge.IsLocal {
					nextState.hasLocal = true
				} else {
					nextState.hasTrunk = true
				}
				if int(edge.Company) >= 0 && int(edge.Company) < len(nextState.companies) {
					c := &nextState.companies[edge.Company]
					c.used = true
					if edge.IsLocal {
						c.local = true
					} else {
						c.trunk = true
					}
				}
				if data.specificMatcher != nil {
					_, nextState.specific = data.specificMatcher.Search(nextPath)
				}
				if data.currentAdjusted != nil {
					_, nextState.adjusted = data.currentAdjusted.Search(nextPath)
				}
				next := &routeLabel{path: nextPath, centerPath: nextCenterPath, seen: cloneSeen(current.seen), eigyo: current.eigyo + edge.EigyoKilo, gisei: current.gisei + edge.GiseiKilo, centerEigyo: nextCenterEigyo, centerGisei: nextCenterGisei, state: nextState}
				next.seen[edge.ToID] = struct{}{}
				if current.centerEigyo <= threshold && nextCenterEigyo > threshold {
					candidate := article114Candidate{
						source:   "threshold_crossing",
						zoneName: zone.Name, centerName: centerName, originName: startName,
						boundaryName: data.full.GetName(currentID), outsideName: data.full.GetName(edge.ToID),
						direction: startName + "→" + data.full.GetName(edge.ToID), threshold: threshold,
						centerBEigyo: current.centerEigyo, centerCEigyo: nextCenterEigyo,
						centerBGisei: current.centerGisei, centerCGisei: nextCenterGisei,
						abEigyo: current.eigyo, abGisei: current.gisei,
						pathAB: append([]int(nil), current.path...), pathAC: nextPath, centerPathC: nextCenterPath,
					}
					consume(candidate)
					// 第114条の候補は、閾値を初めて超えたCで確定します。
					// Cより先へ進むと同じ経路の候補を重複して生成するため、
					// この枝はここで終了します。
					continue
				}
				if addFrontier(frontier, next, stats) {
					heap.Push(queue, next)
				}
			}
		}
	}
}

// adjustedFareReferences は、既存の調整運賃に登録された物理経路を
// 第114条候補の検証行として返します。登録経路の中には、閾値を超える
// Cまで含まない終着駅で定義されたものもあるため、通常のB/C候補とは
// 分けて扱います。
func (data *scanData) adjustedFareReferences() []article114Candidate {
	var references []article114Candidate
	for _, farePath := range data.adjustedFares {
		ids := make([]int, len(farePath.Path))
		valid := true
		for i, name := range farePath.Path {
			id, ok := data.full.GetID(name)
			if !ok {
				valid = false
				break
			}
			ids[i] = id
		}
		if !valid || len(ids) < 2 || !hasUniqueStations(ids) {
			continue
		}
		abEigyo, abGisei, err := pathMetrics(data.physical, ids)
		if err != nil {
			continue
		}
		originName := data.full.GetName(ids[0])
		for _, zone := range data.zones.Zones {
			if !stationInZone(zone, originName) {
				continue
			}
			centerName, ok := ticketgraphio.ZoneCenterStations[zone.Name]
			if !ok && zone.Name == "東京山手線内" {
				centerName, ok = "東京", true
			}
			if !ok {
				continue
			}
			centerID, ok := data.full.GetID(centerName)
			if !ok {
				continue
			}
			centerIndex := slices.Index(ids, centerID)
			if centerIndex <= 0 {
				continue
			}
			centerEigyo, centerGisei, err := pathMetrics(data.physical, ids[centerIndex:])
			if err != nil {
				continue
			}
			candidate := article114Candidate{
				source:         "adjusted_fare_reference",
				zoneName:       zone.Name,
				centerName:     centerName,
				originName:     originName,
				boundaryName:   data.full.GetName(ids[len(ids)-1]),
				direction:      originName + "→" + data.full.GetName(ids[len(ids)-1]),
				centerBEigyo:   centerEigyo,
				centerBGisei:   centerGisei,
				abEigyo:        abEigyo,
				abGisei:        abGisei,
				pathAB:         append([]int(nil), ids...),
				centerPathC:    append([]int(nil), ids[centerIndex:]...),
				adjustedMatch:  true,
				registeredFare: farePath.Fare,
				classification: classificationCovered,
			}
			// farePath.fareは登録値として保存し、currentAB/rawABは
			// 後段の補正禁止モード評価で記録します。
			references = append(references, candidate)
		}
	}
	return references
}

func hasUniqueStations(path []int) bool {
	seen := make(map[int]struct{}, len(path))
	for _, id := range path {
		if _, ok := seen[id]; ok {
			return false
		}
		seen[id] = struct{}{}
	}
	return true
}

func cloneSeen(in map[int]struct{}) map[int]struct{} {
	out := make(map[int]struct{}, len(in)+1)
	for id := range in {
		out[id] = struct{}{}
	}
	return out
}

func sortedIDs(in map[int]struct{}) []int {
	out := make([]int, 0, len(in))
	for id := range in {
		out = append(out, id)
	}
	slices.Sort(out)
	return out
}

func routeKey(path []int) string {
	var b strings.Builder
	for i, id := range path {
		if i > 0 {
			b.WriteByte(',')
		}
		fmt.Fprintf(&b, "%d", id)
	}
	return b.String()
}

func adjustedMatcherFor(data *scanData, path []int) bool {
	if data.currentAdjusted == nil {
		return false
	}
	_, ok := data.currentAdjusted.Search(path)
	return ok
}

func evaluateAdjustedFareReference(data *scanData, candidate *article114Candidate) {
	current, err := evaluateFare(data.current, data.currentFareCache, candidate.pathAB)
	if err != nil {
		candidate.classification = classificationError
		candidate.errorMessage = err.Error()
		return
	}
	raw, err := evaluateFare(data.raw, data.rawFareCache, candidate.pathAB)
	if err != nil {
		candidate.classification = classificationError
		candidate.errorMessage = err.Error()
		return
	}
	candidate.currentAB = current
	candidate.rawAB = raw
	candidate.classification = classificationCovered
}

func evaluateCandidate(data *scanData, candidate *article114Candidate) {
	if len(candidate.pathAB) < 2 || len(candidate.pathAC) != len(candidate.pathAB)+1 {
		candidate.classification = classificationError
		candidate.errorMessage = "BとCが隣接しない経路"
		return
	}
	currentAB, err := evaluateFare(data.current, data.currentFareCache, candidate.pathAB)
	if err != nil {
		candidate.classification = classificationError
		candidate.errorMessage = err.Error()
		return
	}
	currentXC, err := evaluateFare(data.current, data.currentFareCache, candidate.pathAC)
	if err != nil {
		candidate.classification = classificationError
		candidate.errorMessage = err.Error()
		return
	}
	rawAB, err := evaluateFare(data.raw, data.rawFareCache, candidate.pathAB)
	if err != nil {
		candidate.classification = classificationError
		candidate.errorMessage = err.Error()
		return
	}
	rawXC, err := evaluateFare(data.raw, data.rawFareCache, candidate.pathAC)
	if err != nil {
		candidate.classification = classificationError
		candidate.errorMessage = err.Error()
		return
	}
	candidate.currentAB, candidate.currentXC = currentAB, currentXC
	candidate.rawAB, candidate.rawXC = rawAB, rawXC
	candidate.adjustedMatch = adjustedMatcherFor(data, candidate.pathAB) || adjustedMatcherFor(data, candidate.pathAC)
	rawApplicable := candidate.rawAB > candidate.rawXC
	currentApplicable := candidate.currentAB > candidate.currentXC
	switch {
	case !rawApplicable:
		candidate.classification = classificationNone
	case currentApplicable:
		candidate.classification = classificationUncovered
	case candidate.adjustedMatch || candidate.currentAB != candidate.rawAB || candidate.currentXC != candidate.rawXC:
		candidate.classification = classificationCovered
	default:
		candidate.classification = classificationUncovered
	}
}

func evaluateFare(evaluator candidateEvaluator, cache map[string]fareEvaluation, path []int) (int, error) {
	key := routeKey(path)
	if cache != nil {
		if result, ok := cache[key]; ok {
			return result.amount, result.err
		}
	}
	result, _, err := evaluator.ExecuteWithMode(path, 0, "uncorrect")
	amount := 0
	if err == nil {
		amount = result.TotalAmount()
	}
	if cache != nil {
		cache[key] = fareEvaluation{amount: amount, err: err}
	}
	return amount, err
}

func loadMatcher(data []ticketdomain.PathAndFare, g graph.Graph) (*fare.PathMatcher, map[string]struct{}, error) {
	matcher := fare.NewPathMatcher()
	keys := make(map[string]struct{}, len(data))
	for _, f := range data {
		ids := make([]int, len(f.Path))
		ok := true
		for i, name := range f.Path {
			id, exists := g.GetID(name)
			if !exists {
				ok = false
				break
			}
			ids[i] = id
		}
		if !ok {
			continue
		}
		if err := matcher.Insert(ids, f.Fare); err != nil && !errors.Is(err, fare.ErrDuplicateRoute) {
			return nil, nil, err
		}
		keys[routeKey(ids)] = struct{}{}
	}
	return matcher, keys, nil
}

func buildAddonRegistry(g graph.Graph) (*fare.AddonRegistry, error) {
	addons := fare.NewAddonRegistry()
	addons.Register("南千歳", "新千歳空港", 20)
	addons.Register("日根野", "りんくうタウン", 160)
	addons.Register("りんくうタウン", "関西空港", 170)
	addons.Register("日根野", "関西空港", 220)
	addons.Register("児島", "宇多津", 110)
	addons.Register("田吉", "宮崎空港", 130)
	if err := addons.ResolveIDs(g.GetID); err != nil {
		return nil, err
	}
	return addons, nil
}

func buildEvaluator(full *graph.RailwayGraph, zones *ticketgraphio.SpecialZoneRegistry, routes ticketdomain.ZoneRoutes, specific, adjusted *fare.PathMatcher) (*ticketusecase.TicketSegmentEvaluator, error) {
	fareReg := fare.NewRegistry()
	addons, err := buildAddonRegistry(full)
	if err != nil {
		return nil, err
	}
	trainSpecific := fare.NewTrainSpecificSectionCalculator()
	calc := ticketusecase.NewCalculateAmount(fareReg, addons, trainSpecific, specific, adjusted, nil, full, routes)
	applier := ticketusecase.NewSpecialZoneApplier(full, zones)
	return ticketusecase.NewTicketSegmentEvaluator(calc, applier, ticketusecase.NewPostZoneCleanupCorrector(), zones, full), nil
}

func newScanData() (*scanData, error) {
	loader := &ticketgraphio.JSONLoader{}
	physical, full, err := loader.LoadSeparatedGraphs([]io.Reader{ticketDataReader()}, fareDataReaders())
	if err != nil {
		return nil, err
	}
	routes, err := ticketdomain.LoadZoneRoutesFromBytes(readZoneRoutesBytes())
	if err != nil {
		return nil, err
	}
	zones, err := ticketgraphio.LoadSpecialZones()
	if err != nil {
		return nil, err
	}
	for _, z := range zones.Zones {
		full.GetOrAddID(z.Name)
	}
	for _, name := range routes.ZoneNames() {
		full.GetOrAddID(name)
	}
	if err := full.Validate(); err != nil {
		return nil, err
	}
	fareReg, err := ticketFareRegistry()
	if err != nil {
		return nil, err
	}
	specificMatcher, _, err := loadMatcher(fareReg.GetSpecificFares(), full)
	if err != nil {
		return nil, err
	}
	currentMatcher, adjustedKeys, err := loadMatcher(fareReg.GetAdjustedFares(), full)
	if err != nil {
		return nil, err
	}
	current, err := buildEvaluator(full, zones, routes, specificMatcher, currentMatcher)
	if err != nil {
		return nil, err
	}
	raw, err := buildEvaluator(full, zones, routes, specificMatcher, nil)
	if err != nil {
		return nil, err
	}
	return &scanData{physical: physical, full: full, zones: zones, routes: routes, current: current, raw: raw, specificMatcher: specificMatcher, currentAdjusted: currentMatcher, adjustedRoutes: adjustedKeys, adjustedFares: fareReg.GetAdjustedFares(), dataHashes: scannerDataHashes(fareReg), currentFareCache: make(map[string]fareEvaluation), rawFareCache: make(map[string]fareEvaluation)}, nil
}

// The following indirections live in main.go so the scanner remains easy to
// test with synthetic readers without exposing embedded data from graphdata.
var ticketDataReader func() io.Reader
var fareDataReaders func() []io.Reader
var readZoneRoutesBytes func() []byte
var ticketFareRegistry func() (*ticketfareio.Registry, error)

func scannerDataHashes(reg *ticketfareio.Registry) map[string]string {
	hashBytes := func(data []byte) string { sum := sha256.Sum256(data); return fmt.Sprintf("%x", sum[:]) }
	read := func(r io.Reader) []byte { b, _ := io.ReadAll(r); return b }
	marshal := func(v any) []byte { b, _ := json.Marshal(v); return b }
	return map[string]string{
		"edges.json":            hashBytes(read(ticketDataReader())),
		"shinkansen_edges.json": hashBytes(read(graphdata.GetShinkansenEdgesReader())),
		"connecting_edges.json": hashBytes(read(graphdata.GetConnectingEdgesReader())),
		"special_zones.json":    hashBytes(read(graphdataSpecialZonesReader())),
		"zone_routes.json":      hashBytes(readZoneRoutesBytes()),
		"specificFares.json":    hashBytes(marshal(reg.GetSpecificFares())),
		"adjustedFares.json":    hashBytes(marshal(reg.GetAdjustedFares())),
	}
}

func classifyCandidate(c article114Candidate) string { return c.classification }

func isApplicableCandidate(c article114Candidate) bool {
	return c.classification == classificationUncovered || c.classification == classificationCovered
}

func candidateNames(g graph.Graph, path []int) string {
	names := make([]string, len(path))
	for i, id := range path {
		names[i] = g.GetName(id)
	}
	return strings.Join(names, " > ")
}

func candidateToJSON(c article114Candidate, g graph.Graph) map[string]any {
	return map[string]any{
		"source": c.source, "zone": c.zoneName, "center": c.centerName, "origin": c.originName,
		"boundary": c.boundaryName, "outside": c.outsideName, "direction": c.direction,
		"thresholdDeciKilo": c.threshold, "centerBEigyo": c.centerBEigyo, "centerCEigyo": c.centerCEigyo,
		"centerBGisei": c.centerBGisei, "centerCGisei": c.centerCGisei,
		"abEigyo": c.abEigyo, "abGisei": c.abGisei, "registeredFare": c.registeredFare,
		"rawABFare": c.rawAB, "rawCenterCFare": c.rawXC,
		"currentABFare": c.currentAB, "currentCenterCFare": c.currentXC,
		"rawSaving": c.rawAB - c.rawXC, "currentSaving": c.currentAB - c.currentXC,
		"classification": c.classification, "adjustedMatch": c.adjustedMatch,
		"pathAB": candidateNames(g, c.pathAB), "pathAC": candidateNames(g, c.pathAC),
		"centerPathC": candidateNames(g, c.centerPathC), "error": c.errorMessage,
	}
}

var graphdataSpecialZonesReader func() io.Reader
