package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"errors"
	"fmt"
	"slices"
	"strconv"
)

const maxRouteExtensionDepth = 10

// RouteExtensionFareEvaluator は物理経路を運賃評価する関数です。
// 最安モードの候補比較では、呼び出し側がnormalモードを指定します。
type RouteExtensionFareEvaluator func(path []int) (int, error)

// RouteExtensionMatcher は入力経路と延長経路の対応表を検索します。
// 経路全体をキーにしたmapを使いますが、ハッシュ値だけは信頼せず、
// 検索時に保存済みの入力経路とも完全一致を確認します。
type RouteExtensionMatcher struct {
	entries map[string]routeExtensionEntry
}

type routeExtensionEntry struct {
	inputPath  []int
	outputPath []int
}

// NewRouteExtensionMatcher は駅名で定義された対応表を駅IDへ解決します。
// 対応表に含まれる経路は、仮想エッジを含まない物理エッジで構成されている必要があります。
func NewRouteExtensionMatcher(rules []ticketdomain.RouteExtension, g graph.Graph) (*RouteExtensionMatcher, error) {
	if g == nil {
		return nil, errors.New("経路延長対応表のグラフがnilです")
	}

	idRules := make([]ticketdomain.RouteExtensionIDs, 0, len(rules))
	for i, rule := range rules {
		input, err := resolveExtensionPath(rule.InputPath, g)
		if err != nil {
			return nil, fmt.Errorf("経路延長対応表[%d]の入力経路: %w", i, err)
		}
		output, err := resolveExtensionPath(rule.OutputPath, g)
		if err != nil {
			return nil, fmt.Errorf("経路延長対応表[%d]の出力経路: %w", i, err)
		}
		idRules = append(idRules, ticketdomain.RouteExtensionIDs{
			InputPath:  toInt32Path(input),
			OutputPath: toInt32Path(output),
		})
	}
	return newRouteExtensionMatcher(idRules, g)
}

// NewRouteExtensionMatcherIDs は、駅IDで生成された対応表からMatcherを作成します。
// WASMではこの形式を使い、駅名JSONを実行時に解析しません。
func NewRouteExtensionMatcherIDs(rules []ticketdomain.RouteExtensionIDs, g graph.Graph) (*RouteExtensionMatcher, error) {
	if g == nil {
		return nil, errors.New("経路延長対応表のグラフがnilです")
	}
	return newRouteExtensionMatcher(rules, g)
}

func newRouteExtensionMatcher(rules []ticketdomain.RouteExtensionIDs, g graph.Graph) (*RouteExtensionMatcher, error) {
	matcher := &RouteExtensionMatcher{entries: make(map[string]routeExtensionEntry, len(rules))}
	physical := physicalGraphForExtensions(g)
	for i, rule := range rules {
		input := int32PathToInt(rule.InputPath)
		output := int32PathToInt(rule.OutputPath)
		if len(input) < 2 || len(output) <= len(input) || !slices.Equal(output[:len(input)], input) {
			return nil, fmt.Errorf("経路延長対応表[%d]の出力経路が入力経路の延長ではありません", i)
		}
		if domain.HasDuplicateStation(input) || domain.HasDuplicateStation(output) {
			return nil, fmt.Errorf("経路延長対応表[%d]に駅の重複があります", i)
		}
		if err := validatePhysicalPath(physical, input); err != nil {
			return nil, fmt.Errorf("経路延長対応表[%d]の入力経路: %w", i, err)
		}
		if err := validatePhysicalPath(physical, output); err != nil {
			return nil, fmt.Errorf("経路延長対応表[%d]の出力経路: %w", i, err)
		}

		key := extensionPathKey(input)
		if _, exists := matcher.entries[key]; exists {
			return nil, fmt.Errorf("経路延長対応表[%d]で入力経路が重複しています", i)
		}
		matcher.entries[key] = routeExtensionEntry{
			inputPath:  append([]int(nil), input...),
			outputPath: append([]int(nil), output...),
		}
	}
	return matcher, nil
}

func toInt32Path(path []int) []int32 {
	out := make([]int32, len(path))
	for i, id := range path {
		out[i] = int32(id)
	}
	return out
}

func int32PathToInt(path []int32) []int {
	out := make([]int, len(path))
	for i, id := range path {
		out[i] = int(id)
	}
	return out
}

func resolveExtensionPath(names []string, g graph.Graph) ([]int, error) {
	if len(names) == 0 {
		return nil, errors.New("経路が空です")
	}
	path := make([]int, len(names))
	for i, name := range names {
		id, ok := g.GetID(name)
		if !ok {
			return nil, fmt.Errorf("駅が見つかりません: %s", name)
		}
		path[i] = id
	}
	return path, nil
}

func physicalGraphForExtensions(g graph.Graph) graph.Graph {
	if railway, ok := g.(*graph.RailwayGraph); ok {
		if railway.PhysicalEdgeCounts != nil {
			return graph.NewPhysicalGraphView(railway)
		}
	}
	return g
}

func validatePhysicalPath(g graph.TopologyProvider, path []int) error {
	for i := 0; i+1 < len(path); i++ {
		found := false
		for _, edge := range g.GetEdges(path[i]) {
			if edge.ToID == path[i+1] {
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("物理エッジが見つかりません: %d -> %d", path[i], path[i+1])
		}
	}
	return nil
}

// Match は入力経路に完全一致する延長経路を返します。
func (m *RouteExtensionMatcher) Match(path []int) ([]int, bool) {
	if m == nil || len(path) == 0 {
		return nil, false
	}
	entry, ok := m.entries[extensionPathKey(path)]
	if !ok || !slices.Equal(entry.inputPath, path) {
		return nil, false
	}
	return append([]int(nil), entry.outputPath...), true
}

// MatchEither は入力経路の正方向または逆方向に一致する延長経路を返します。
// 対応表は片方向だけ保持し、逆方向に一致した場合は出力経路を反転します。
func (m *RouteExtensionMatcher) MatchEither(path []int) ([]int, bool) {
	if m == nil {
		return nil, false
	}
	if extended, ok := m.Match(path); ok {
		return extended, true
	}
	if len(path) == 0 {
		return nil, false
	}
	reversed := append([]int(nil), path...)
	slices.Reverse(reversed)
	entry, ok := m.entries[extensionPathKey(reversed)]
	if !ok || !slices.Equal(entry.inputPath, reversed) {
		return nil, false
	}
	output := append([]int(nil), entry.outputPath...)
	slices.Reverse(output)
	return output, true
}

type extensionDirection uint8

const (
	extendOrigin extensionDirection = iota
	extendDestination
)

type extensionSearchSpec struct {
	direction extensionDirection
	zone      ticketdomain.SpecialZone
}

type extensionSearchState struct {
	path  []int
	depth int
}

// SelectCheapestPathWithRouteExtensions は、最安モードの物理経路候補を
// normalで評価し、最安の経路を返します。対応表に一致した場合は
// 運賃比較を行わず、対応表の出力経路を採用します。
func SelectCheapestPathWithRouteExtensions(
	path []int,
	g graph.Graph,
	corrector PathCorrector,
	extensions *RouteExtensionMatcher,
	zones *graphio.SpecialZoneRegistry,
	fareEval RouteExtensionFareEvaluator,
) ([]int, error) {
	selected, _, err := SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath(path, g, corrector, extensions, zones, fareEval)
	return selected, err
}

// SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath は、最安モードの
// 採用経路と、大都市近郊区間判定に使う新幹線展開直前の経路を返します。
func SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath(
	path []int,
	g graph.Graph,
	corrector PathCorrector,
	extensions *RouteExtensionMatcher,
	zones *graphio.SpecialZoneRegistry,
	fareEval RouteExtensionFareEvaluator,
) ([]int, []int, error) {
	if len(path) < 2 {
		return nil, nil, domain.ErrInvalidPath
	}
	if fareEval == nil {
		corrected, before, err := correctPathForModeWithPreShinkansenPath(path, g, corrector, "cheapest")
		return corrected, before, err
	}

	if extensions != nil {
		if extended, ok := extensions.MatchEither(path); ok {
			// 対応表は事前に定義された経路変換です。入力経路との運賃差や
			// 同額判定を行わず、出力経路を通常モードの最終評価へ渡します。
			return append([]int(nil), extended...), append([]int(nil), extended...), nil
		}
	}

	candidates := make([][]int, 0, 8)
	seen := make(map[string]struct{})
	addCandidate := func(candidate []int) {
		if len(candidate) < 2 || domain.HasDuplicateStation(candidate) {
			return
		}
		key := extensionPathKey(candidate)
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		candidates = append(candidates, append([]int(nil), candidate...))
	}
	addCandidate(path)

	if extensions != nil {
		if zones != nil {
			for _, extended := range sequentialRouteExtensions(path, g, zones) {
				addCandidate(extended)
			}
		}
	} else if zones != nil {
		for _, extended := range sequentialRouteExtensions(path, g, zones) {
			addCandidate(extended)
		}
	}

	var best []int
	bestFare := 0
	var lastErr error
	for _, candidate := range candidates {
		fare, err := fareEval(candidate)
		if err != nil {
			lastErr = err
			continue
		}
		if best == nil || fare < bestFare {
			best = candidate
			bestFare = fare
		}
	}
	if best != nil {
		return best, append([]int(nil), best...), nil
	}

	// 候補の評価がすべて失敗した場合は、既存の最安モード補正へ戻します。
	corrected, before, err := correctPathForModeWithPreShinkansenPath(path, g, corrector, "cheapest")
	if err != nil {
		if lastErr != nil {
			return nil, nil, lastErr
		}
		return nil, nil, err
	}
	return corrected, before, nil
}

func sequentialRouteExtensions(path []int, g graph.Graph, zones *graphio.SpecialZoneRegistry) [][]int {
	if g == nil || zones == nil || len(path) < 2 {
		return nil
	}
	originZones := zones.FindZonesByStation(g.GetName(path[0]))
	destinationZones := zones.FindZonesByStation(g.GetName(path[len(path)-1]))
	if len(originZones) == 0 && len(destinationZones) == 0 {
		return nil
	}

	specs := make([]extensionSearchSpec, 0, len(originZones)+len(destinationZones))
	if len(originZones) > 0 && len(destinationZones) > 0 {
		for _, zone := range destinationZones {
			specs = append(specs, extensionSearchSpec{direction: extendOrigin, zone: zone})
		}
		for _, zone := range originZones {
			specs = append(specs, extensionSearchSpec{direction: extendDestination, zone: zone})
		}
	} else if len(originZones) > 0 {
		for _, zone := range originZones {
			specs = append(specs, extensionSearchSpec{direction: extendDestination, zone: zone})
		}
	} else {
		for _, zone := range destinationZones {
			specs = append(specs, extensionSearchSpec{direction: extendOrigin, zone: zone})
		}
	}

	var result [][]int
	seen := make(map[string]struct{})
	for _, spec := range specs {
		for _, candidate := range searchRouteExtension(path, g, spec) {
			key := extensionPathKey(candidate)
			if _, exists := seen[key]; exists {
				continue
			}
			seen[key] = struct{}{}
			result = append(result, candidate)
		}
	}
	return result
}

func searchRouteExtension(path []int, g graph.Graph, spec extensionSearchSpec) [][]int {
	centerName, ok := graphio.ZoneCenterStations[spec.zone.Name]
	if !ok {
		return nil
	}
	centerID, ok := g.GetID(centerName)
	if !ok {
		return nil
	}
	physical := physicalGraphForExtensions(g)
	endpoint := path[len(path)-1]
	if spec.direction == extendOrigin {
		endpoint = path[0]
	}
	initialDistance, ok := centerDistanceOnPathOrShortestWithFallback(path, centerID, endpoint, physical, g)
	if !ok || initialDistance > spec.zone.MinDistanceDeciKilo {
		return nil
	}

	queue := []extensionSearchState{{path: append([]int(nil), path...), depth: 0}}
	var result [][]int
	for len(queue) > 0 {
		state := queue[0]
		queue = queue[1:]
		currentEndpoint := state.path[len(state.path)-1]
		if spec.direction == extendOrigin {
			currentEndpoint = state.path[0]
		}
		distance, ok := centerDistanceOnPathOrShortestWithFallback(state.path, centerID, currentEndpoint, physical, g)
		if !ok {
			continue
		}
		if state.depth > 0 && distance > spec.zone.MinDistanceDeciKilo {
			result = append(result, append([]int(nil), state.path...))
			continue
		}
		if state.depth >= maxRouteExtensionDepth {
			continue
		}

		for _, edge := range physical.GetEdges(currentEndpoint) {
			var next []int
			if spec.direction == extendOrigin {
				next = make([]int, 0, len(state.path)+1)
				next = append(next, edge.ToID)
				next = append(next, state.path...)
			} else {
				next = append(append([]int(nil), state.path...), edge.ToID)
			}
			if domain.HasDuplicateStation(next) {
				continue
			}
			queue = append(queue, extensionSearchState{path: next, depth: state.depth + 1})
		}
	}
	return result
}

func centerDistanceOnPathOrShortest(path []int, centerID, endpointID int, g graph.Graph) (domain.DeciKilo, bool) {
	return centerDistanceOnPathOrShortestWithFallback(path, centerID, endpointID, g, nil)
}

func centerDistanceOnPathOrShortestWithFallback(path []int, centerID, endpointID int, pathGraph, fallbackGraph graph.Graph) (domain.DeciKilo, bool) {
	if centerID == endpointID {
		return 0, true
	}
	centerIndex := -1
	endpointIndex := -1
	for i, id := range path {
		if id == centerID {
			centerIndex = i
		}
		if id == endpointID {
			endpointIndex = i
		}
	}
	if centerIndex >= 0 && endpointIndex >= 0 {
		start, end := centerIndex, endpointIndex
		if start > end {
			start, end = end, start
		}
		// 入力経路には臨時駅などの仮想エッジが含まれる場合があります。
		// まず物理エッジで距離を計算し、物理経路だけでは解決できない
		// 既存の仮想区間がある場合だけフルグラフへフォールバックします。
		segment := path[start : end+1]
		if distance, ok := pathEigyoKiloStrict(pathGraph, segment); ok {
			return distance, true
		}
		if fallbackGraph != nil {
			if distance, ok := pathEigyoKiloStrict(fallbackGraph, segment); ok {
				return distance, true
			}
		}
		// 既存の一時駅など、隣接駅間を物理ショートカットで表す入力は
		// 従来の距離解決へ戻します。
		if distance, ok := pathEigyoKilo(pathGraph, segment); ok {
			return distance, true
		}
		return 0, false
	}

	shortest, err := pathGraph.FindShortestPathGisei(centerID, endpointID)
	if err != nil || shortest == nil || len(shortest.StationIDs) == 0 {
		return 0, false
	}
	return pathEigyoKilo(pathGraph, shortest.StationIDs)
}

func pathEigyoKilo(g graph.TopologyProvider, path []int) (domain.DeciKilo, bool) {
	var total domain.DeciKilo
	for i := 0; i+1 < len(path); {
		found := false
		// 臨時駅などの仮想エッジが入力経路に含まれていても、前後駅を
		// 結ぶ物理エッジがあれば、その物理エッジを距離計算に使います。
		// 直近の到達駅を優先し、経路上の駅順は維持します。
		for j := i + 1; j < len(path); j++ {
			for _, edge := range g.GetEdges(path[i]) {
				if edge.ToID != path[j] {
					continue
				}
				total += edge.EigyoKilo
				i = j
				found = true
				break
			}
			if found {
				break
			}
		}
		if !found {
			return 0, false
		}
	}
	return total, true
}

func pathEigyoKiloStrict(g graph.TopologyProvider, path []int) (domain.DeciKilo, bool) {
	var total domain.DeciKilo
	for i := 0; i+1 < len(path); i++ {
		found := false
		for _, edge := range g.GetEdges(path[i]) {
			if edge.ToID == path[i+1] {
				total += edge.EigyoKilo
				found = true
				break
			}
		}
		if !found {
			return 0, false
		}
	}
	return total, true
}

func extensionPathKey(path []int) string {
	buf := make([]byte, 0, len(path)*4)
	for _, id := range path {
		buf = strconv.AppendInt(buf, int64(id), 10)
		buf = append(buf, ',')
	}
	return string(buf)
}
