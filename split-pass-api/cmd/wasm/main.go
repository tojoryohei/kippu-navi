//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"math"
	"syscall/js"
	"unsafe"

	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/usecase"
)

// tempBuffer はJSから書き込まれる間、GCによる回収を防ぐためのグローバルピン留めバッファ
var tempBuffer []byte

// wasmGraph はロードされたバイナリグラフのグローバルインスタンス
var wasmGraph *WasmGraph
var baseGraph *graph.RailwayGraph
var icGraph *graph.RailwayGraph
var baseAmountCalc *usecase.CalculateAmount
var icAmountCalc *usecase.CalculateAmount
var bypassRules []domain.ResolvedBypassRule

// 実行中のコンテキスト
var activeGraph *graph.RailwayGraph
var activeAmountCalc *usecase.CalculateAmount

// EdgeBinary はバイナリデータ内の辺表現 (16 bytes)
type EdgeBinary struct {
	ToID                   int32
	EigyoKilo              int16
	GiseiKilo              int16
	Company                int16
	IsLocal                bool
	IsTrainSpecificSection bool
	IsBarrierFreeSection   bool
	IsIcPassArea           bool
	Pad                    [2]byte
}

// WasmGraph はバイナリデータからキャストされたグラフデータを提供する Graph 実装
type WasmGraph struct {
	numStations int32
	numEdges    int32
	indptr      []int32
	indices     []int32
	edgeData    []EdgeBinary
	nameOffsets []int32
	namesBlob   []byte
	nameMap     map[string]int32
}

func (g *WasmGraph) GetEdges(id int) []domain.Edge {
	if id < 0 || id >= int(g.numStations) {
		return nil
	}
	start := g.indptr[id]
	end := g.indptr[id+1]
	ebs := g.edgeData[start:end]

	edges := make([]domain.Edge, len(ebs))
	for i, eb := range ebs {
		edges[i] = domain.Edge{
			FromID:                 id,
			ToID:                   int(eb.ToID),
			EigyoKilo:              domain.DeciKilo(eb.EigyoKilo),
			GiseiKilo:              domain.DeciKilo(eb.GiseiKilo),
			Company:                domain.CompanyID(eb.Company),
			IsLocal:                eb.IsLocal,
			IsTrainSpecificSection: eb.IsTrainSpecificSection,
			IsBarrierFreeSection:   eb.IsBarrierFreeSection,
			IsIcPassArea:           eb.IsIcPassArea,
		}
	}
	return edges
}

func (g *WasmGraph) GetID(name string) (int, bool) {
	id, ok := g.nameMap[name]
	return int(id), ok
}

func (g *WasmGraph) GetName(id int) string {
	if id < 0 || id >= int(g.numStations) {
		return ""
	}
	start := g.nameOffsets[id]
	end := g.nameOffsets[id+1]
	return string(g.namesBlob[start:end])
}

func (g *WasmGraph) NumStations() int {
	return int(g.numStations)
}

func (g *WasmGraph) GetGroupID(id int) int {
	return 1
}

// Bitset はDFSの訪問管理用のビットマップ
type Bitset []uint64

func NewBitset(size int) Bitset {
	return make(Bitset, (size+63)/64)
}

func (b Bitset) Set(i int) {
	b[i>>6] |= (1 << (i & 63))
}

func (b Bitset) Clear(i int) {
	b[i>>6] &= ^(1 << (i & 63))
}

func (b Bitset) Get(i int) bool {
	return (b[i>>6] & (1 << (i & 63))) != 0
}

// JavaScript バインディング用ヘルパー
func prepareGraphBuffer(this js.Value, args []js.Value) interface{} {
	size := args[0].Int()
	tempBuffer = make([]byte, size)
	ptr := uintptr(unsafe.Pointer(&tempBuffer[0]))
	return js.ValueOf(int(ptr))
}

func initGraphFromBuffer(this js.Value, args []js.Value) interface{} {
	if len(tempBuffer) < 16 {
		return js.ValueOf("error: buffer is too small")
	}

	magic := string(tempBuffer[:8])
	if magic != "WASMGRA\x00" {
		return js.ValueOf(fmt.Sprintf("error: invalid magic header: %q", magic))
	}

	numStations := *(*int32)(unsafe.Pointer(&tempBuffer[8]))
	numEdges := *(*int32)(unsafe.Pointer(&tempBuffer[12]))

	offsetIndptr := 16
	offsetIndices := offsetIndptr + int(numStations+1)*4
	offsetEdgeData := offsetIndices + int(numEdges)*4
	offsetNameOffsets := offsetEdgeData + int(numEdges)*16
	offsetNamesBlob := offsetNameOffsets + int(numStations+1)*4

	indptr := unsafe.Slice((*int32)(unsafe.Pointer(&tempBuffer[offsetIndptr])), numStations+1)
	indices := unsafe.Slice((*int32)(unsafe.Pointer(&tempBuffer[offsetIndices])), numEdges)
	edgeData := unsafe.Slice((*EdgeBinary)(unsafe.Pointer(&tempBuffer[offsetEdgeData])), numEdges)
	nameOffsets := unsafe.Slice((*int32)(unsafe.Pointer(&tempBuffer[offsetNameOffsets])), numStations+1)
	namesBlob := tempBuffer[offsetNamesBlob : offsetNamesBlob+int(nameOffsets[numStations])]

	nameMap := make(map[string]int32, numStations)
	for i := 0; i < int(numStations); i++ {
		start := nameOffsets[i]
		end := nameOffsets[i+1]
		name := string(namesBlob[start:end])
		nameMap[name] = int32(i)
	}

	wasmGraph = &WasmGraph{
		numStations: numStations,
		numEdges:    numEdges,
		indptr:      indptr,
		indices:     indices,
		edgeData:    edgeData,
		nameOffsets: nameOffsets,
		namesBlob:   namesBlob,
		nameMap:     nameMap,
	}

	// baseGraph の構築
	baseGraph = &graph.RailwayGraph{
		FastGraph: &graph.FastGraph{
			Edges: make([][]domain.Edge, numStations),
		},
		StationNameIDMapper: &graph.StationNameIDMapper{
			NameToID: make(map[string]int, numStations),
			IDToName: make([]string, numStations),
		},
	}
	for i := 0; i < int(numStations); i++ {
		baseGraph.IDToName[i] = wasmGraph.GetName(i)
		baseGraph.NameToID[wasmGraph.GetName(i)] = i
		baseGraph.Edges[i] = wasmGraph.GetEdges(i)
	}

	// icGraph の構築
	ic, err := graph.NewIcPassGraph(baseGraph)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: NewIcPassGraph failed: %v", err))
	}
	icGraph = ic

	// baseAmountCalc の構築
	baseCalcs, err := fareio.InitRegistry(baseGraph)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: InitRegistry failed: %v", err))
	}

	addonFareReg := domain.NewAddonRegistry()
	addonFareReg.Register("南千歳", "新千歳空港", domain.PassPrice{OneMonth: 660, ThreeMonth: 1880, SixMonth: 3180})
	addonFareReg.Register("日根野", "りんくうタウン", domain.PassPrice{OneMonth: 4690, ThreeMonth: 13320, SixMonth: 22440})
	addonFareReg.Register("日根野", "関西空港", domain.PassPrice{OneMonth: 6640, ThreeMonth: 18900, SixMonth: 31820})
	addonFareReg.Register("りんくうタウン", "関西空港", domain.PassPrice{OneMonth: 5010, ThreeMonth: 14250, SixMonth: 24000})
	addonFareReg.Register("児島", "宇多津", domain.PassPrice{OneMonth: 1610, ThreeMonth: 4600, SixMonth: 8170})
	addonFareReg.Register("田吉", "宮崎空港", domain.PassPrice{OneMonth: 3840, ThreeMonth: 10960, SixMonth: 18680})

	addonFareReg.ResolveIDs(func(name string) (int, bool) {
		return baseGraph.GetID(name)
	})

	addonChargeReg := domain.NewAddonRegistry()
	addonChargeReg.Register("博多", "博多南", domain.PassPrice{OneMonth: 4680, ThreeMonth: 13340, SixMonth: 25270})
	addonChargeReg.ResolveIDs(func(name string) (int, bool) {
		return baseGraph.GetID(name)
	})

	baseAmountCalc = usecase.NewCalculateAmount(
		baseGraph,
		baseCalcs.Registry,
		addonFareReg,
		addonChargeReg,
		baseCalcs.TrainSpecific,
		baseCalcs.SpecificRoute,
		baseCalcs.AdjustedRoute,
	)

	// icAmountCalc の構築
	icCalcs, err := fareio.InitRegistry(icGraph)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ic InitRegistry failed: %v", err))
	}
	icAmountCalc = usecase.NewCalculateAmount(
		icGraph,
		icCalcs.Registry,
		addonFareReg,
		addonChargeReg,
		icCalcs.TrainSpecific,
		icCalcs.SpecificRoute,
		icCalcs.AdjustedRoute,
	)

	// 特例ルールの設定
	bypassReg := domain.NewBypassRegistry()
	bypassReg.Register(
		[]string{"大沼", "大沼公園", "赤井川", "駒ケ岳", "森"},
		[]string{"大沼", "鹿部", "渡島沼尻", "渡島砂原", "掛澗", "尾白内", "東森", "森"},
	)
	bypassReg.Register(
		[]string{"日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽"},
		[]string{"日暮里", "尾久", "赤羽"},
	)
	bypassReg.Register(
		[]string{"赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"},
		[]string{"赤羽", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "大宮"},
	)
	bypassReg.Register(
		[]string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見"},
		[]string{"品川", "西大井", "武蔵小杉", "新川崎", "鶴見"},
	)

	rules, err := bypassReg.ResolveIDs(func(name string) (int, bool) {
		return baseGraph.GetID(name)
	})
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ResolveIDs failed: %v", err))
	}
	bypassRules = rules

	// 初期化完了に伴い、一時バッファへのピン留めを解除しGCに開放
	tempBuffer = nil

	return js.ValueOf(true)
}

func reconstructAndCalculate(this js.Value, args []js.Value) interface{} {
	splitStationsJson := args[0].String()
	months := args[1].Int()
	isIc := args[2].Bool()

	if isIc {
		activeGraph = icGraph
		activeAmountCalc = icAmountCalc
	} else {
		activeGraph = baseGraph
		activeAmountCalc = baseAmountCalc
	}

	var splitNames []string
	if err := json.Unmarshal([]byte(splitStationsJson), &splitNames); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error":"JSON unmarshal failed: %v"}`, err))
	}

	if len(splitNames) < 2 {
		return js.ValueOf(`{"error":"at least 2 stations required"}`)
	}

	splitIDs := make([]int, len(splitNames))
	for i, name := range splitNames {
		id, ok := wasmGraph.GetID(name)
		if !ok {
			return js.ValueOf(fmt.Sprintf(`{"error":"station not found: %s"}`, name))
		}
		splitIDs[i] = id
	}

	var allSegCandidates [][]SplitSegment
	for i := 0; i < len(splitIDs)-1; i++ {
		segs, err := getCheapestNoSplitSegmentsWasm(splitIDs[i], splitIDs[i+1], months)
		if err != nil {
			return js.ValueOf(fmt.Sprintf(`{"error":"failed to get segments: %v"}`, err))
		}
		allSegCandidates = append(allSegCandidates, segs)
	}

	combinations := generateCombinationsWasm(allSegCandidates)

	type SegmentResponse struct {
		Path           []string                  `json:"path"`
		Via            []string                  `json:"via"`
		Result         *usecase.CalculationResult `json:"result"`
		TotalEigyoKilo domain.DeciKilo           `json:"totalEigyoKilo"`
		Start          string                    `json:"start"`
		End            string                    `json:"end"`
	}

	type ResultResponse struct {
		TotalAmount int               `json:"totalAmount"`
		Segments    []SegmentResponse `json:"segments"`
	}

	type ClientResponse struct {
		Normal  ResultResponse   `json:"normal"`
		Results []ResultResponse `json:"results"`
	}

	var clientResults []ResultResponse
	for _, combo := range combinations {
		var apiSegments []SegmentResponse
		totalAmount := 0
		for _, seg := range combo {
			pathNames := make([]string, len(seg.Path))
			for k, id := range seg.Path {
				pathNames[k] = wasmGraph.GetName(id)
			}
			viaNames := usecase.GetVia(activeGraph, seg.Path)
			var eigyo domain.DeciKilo
			if seg.Result != nil {
				eigyo = seg.Result.TotalEigyoKilo
			}
			fare := seg.Result.Fare + seg.Result.BarrierFreeFee + seg.Result.Charge
			totalAmount += fare

			apiSegments = append(apiSegments, SegmentResponse{
				Path:           pathNames,
				Via:            viaNames,
				Result:         seg.Result,
				TotalEigyoKilo: eigyo,
				Start:          wasmGraph.GetName(seg.StartStationID),
				End:            wasmGraph.GetName(seg.EndStationID),
			})
		}
		clientResults = append(clientResults, ResultResponse{
			TotalAmount: totalAmount,
			Segments:    apiSegments,
		})
	}

	// 通常経路（分割なし）の算出
	normalSegs, err := getCheapestNoSplitSegmentsWasm(splitIDs[0], splitIDs[len(splitIDs)-1], months)
	var normalResult ResultResponse
	if err == nil && len(normalSegs) > 0 {
		seg := normalSegs[0]
		pathNames := make([]string, len(seg.Path))
		for k, id := range seg.Path {
			pathNames[k] = wasmGraph.GetName(id)
		}
		viaNames := usecase.GetVia(activeGraph, seg.Path)
		var eigyo domain.DeciKilo
		if seg.Result != nil {
			eigyo = seg.Result.TotalEigyoKilo
		}
		fare := seg.Result.Fare + seg.Result.BarrierFreeFee + seg.Result.Charge
		normalResult = ResultResponse{
			TotalAmount: fare,
			Segments: []SegmentResponse{
				{
					Path:           pathNames,
					Via:            viaNames,
					Result:         seg.Result,
					TotalEigyoKilo: eigyo,
					Start:          wasmGraph.GetName(seg.StartStationID),
					End:            wasmGraph.GetName(seg.EndStationID),
				},
			},
		}
	}

	resObj := ClientResponse{
		Normal:  normalResult,
		Results: clientResults,
	}

	resBytes, _ := json.Marshal(resObj)
	return js.ValueOf(string(resBytes))
}

type SplitSegment struct {
	StartStationID int
	EndStationID   int
	Path           []int
	Result         *usecase.CalculationResult
}

func getCheapestNoSplitSegmentsWasm(start, end, months int) ([]SplitSegment, error) {
	// 最短経路を検索
	shortest, err := activeGraph.FindShortestPathGisei(start, end)
	if err != nil {
		return nil, fmt.Errorf("wasm: FindShortestPathGisei failed: %w", err)
	}

	maxGisei := shortest.GiseiKilo + 50
	dfsPaths := dfsFindPathsWasm(start, end, maxGisei)
	bypassPaths := getBypassCandidatesWasm(start, end)

	allPaths := append(dfsPaths, bypassPaths...)

	var validPaths [][]int
	for _, path := range allPaths {
		if !checkMixedRouteConflictWasm(path) {
			continue
		}
		if !containsPath(validPaths, path) {
			validPaths = append(validPaths, path)
		}
	}

	if len(validPaths) == 0 {
		return nil, fmt.Errorf("wasm: no valid paths found")
	}

	minFare := math.MaxInt
	var bestPaths [][]int
	var bestResults []*usecase.CalculationResult

	for _, path := range validPaths {
		res, err := activeAmountCalc.Execute(path, months)
		if err != nil {
			continue
		}
		fare := res.TotalAmount()
		if fare < minFare {
			minFare = fare
			bestPaths = [][]int{path}
			bestResults = []*usecase.CalculationResult{res}
		} else if fare == minFare {
			if !containsPath(bestPaths, path) {
				bestPaths = append(bestPaths, path)
				bestResults = append(bestResults, res)
			}
		}
	}

	if minFare == math.MaxInt {
		return nil, fmt.Errorf("wasm: calculation failed for all paths")
	}

	var segs []SplitSegment
	for i, path := range bestPaths {
		segs = append(segs, SplitSegment{
			Path:           path,
			Result:         bestResults[i],
			StartStationID: start,
			EndStationID:   end,
		})
	}
	return segs, nil
}

// Bitset 訪問フラグを使用した高速 DFS (逆ダイクストラによる枝刈り付き)
func dfsFindPathsWasm(start, end int, maxGisei domain.DeciKilo) [][]int {
	var paths [][]int
	numStations := wasmGraph.NumStations()
	visited := NewBitset(numStations)
	currentPath := make([]int, 0, 64)

	// ゴール（end）から全駅への最短擬制キロを一瞬で計算
	distToEnd, _ := activeGraph.FindAllShortestPathsGisei(end)

	currentPath = append(currentPath, start)
	visited.Set(start)

	const maxPathsLimit = 5000

	var dfs func(curr int, currentGisei domain.DeciKilo) bool
	dfs = func(curr int, currentGisei domain.DeciKilo) bool {
		if len(paths) >= maxPathsLimit {
			return false
		}

		if curr == end {
			pathCopy := make([]int, len(currentPath))
			copy(pathCopy, currentPath)
			paths = append(paths, pathCopy)
			return true
		}

		edges := wasmGraph.GetEdges(curr)
		for _, edge := range edges {
			next := edge.ToID
			if next < 0 || next >= numStations {
				continue
			}
			if visited.Get(next) {
				continue
			}

			nextGisei := currentGisei + edge.GiseiKilo
			// 「これまでの擬制キロ」＋「今回の辺」＋「次の駅からゴールまでの残り最小擬制キロ」が制限を超える場合は枝刈り
			if nextGisei+distToEnd[next] > maxGisei {
				continue
			}

			visited.Set(next)
			currentPath = append(currentPath, next)

			if !dfs(next, nextGisei) {
				return false
			}

			currentPath = currentPath[:len(currentPath)-1]
			visited.Clear(next)
		}
		return true
	}

	dfs(start, 0)
	return paths
}

func getBypassCandidatesWasm(start, end int) [][]int {
	var cands [][]int
	for _, rule := range bypassRules {
		aOnRule := containsStation(rule.ShortcutPath, start) || containsStation(rule.DetourPath, start)
		bOnRule := containsStation(rule.ShortcutPath, end) || containsStation(rule.DetourPath, end)
		if aOnRule && bOnRule {
			aOnDetourMiddle := isOnDetourMiddle(start, rule)
			bOnDetourMiddle := isOnDetourMiddle(end, rule)
			if aOnDetourMiddle || bOnDetourMiddle {
				shortcutPath := make([]int, len(rule.ShortcutPath))
				copy(shortcutPath, rule.ShortcutPath)
				cands = append(cands, shortcutPath)
			}
		}
	}
	// オーバーシュート経路
	for _, rule := range bypassRules {
		startOnDetour := isOnDetourMiddle(start, rule)
		endOnDetour := isOnDetourMiddle(end, rule)

		if startOnDetour {
			pathJ2ToEnd, err := activeGraph.FindShortestPathGisei(rule.ShortcutPath[len(rule.ShortcutPath)-1], end)
			if err == nil && len(pathJ2ToEnd.StationIDs) >= 2 {
				cand := append([]int(nil), rule.ShortcutPath...)
				cand = append(cand, pathJ2ToEnd.StationIDs[1:]...)
				cands = append(cands, cand)
			}

			pathJ1ToEnd, err := activeGraph.FindShortestPathGisei(rule.ShortcutPath[0], end)
			if err == nil && len(pathJ1ToEnd.StationIDs) >= 2 {
				revShortcut := reverseSlice(rule.ShortcutPath)
				cand := append([]int(nil), revShortcut...)
				cand = append(cand, pathJ1ToEnd.StationIDs[1:]...)
				cands = append(cands, cand)
			}
		}

		if endOnDetour {
			pathStartToJ1, err := activeGraph.FindShortestPathGisei(start, rule.ShortcutPath[0])
			if err == nil && len(pathStartToJ1.StationIDs) >= 2 {
				cand := append([]int(nil), pathStartToJ1.StationIDs...)
				cand = append(cand, rule.ShortcutPath[1:]...)
				cands = append(cands, cand)
			}

			pathStartToJ2, err := activeGraph.FindShortestPathGisei(start, rule.ShortcutPath[len(rule.ShortcutPath)-1])
			if err == nil && len(pathStartToJ2.StationIDs) >= 2 {
				revShortcut := reverseSlice(rule.ShortcutPath)
				cand := append([]int(nil), pathStartToJ2.StationIDs...)
				cand = append(cand, revShortcut[1:]...)
				cands = append(cands, cand)
			}
		}
	}
	return cands
}

func checkMixedRouteConflictWasm(path []int) bool {
	pathSet := make(map[int]bool, len(path))
	for _, sid := range path {
		pathSet[sid] = true
	}

	for _, rule := range bypassRules {
		hasShortcutInner := false
		if len(rule.ShortcutPath) > 2 {
			for i := 1; i < len(rule.ShortcutPath)-1; i++ {
				if pathSet[rule.ShortcutPath[i]] {
					hasShortcutInner = true
					break
				}
			}
		}

		if !hasShortcutInner {
			continue
		}

		hasAllDetour := true
		for _, detID := range rule.DetourPath {
			if !pathSet[detID] {
				hasAllDetour = false
				break
			}
		}

		if hasShortcutInner && hasAllDetour {
			return false
		}
	}
	return true
}

func containsPath(paths [][]int, target []int) bool {
	for _, p := range paths {
		if equalSlices(p, target) {
			return true
		}
	}
	return false
}

func equalSlices(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i, v := range a {
		if v != b[i] {
			return false
		}
	}
	return true
}

func containsStation(path []int, stationID int) bool {
	for _, id := range path {
		if id == stationID {
			return true
		}
	}
	return false
}

func isOnDetourMiddle(stationID int, rule domain.ResolvedBypassRule) bool {
	for i := 1; i < len(rule.DetourPath)-1; i++ {
		if rule.DetourPath[i] == stationID {
			return true
		}
	}
	return false
}

func reverseSlice(s []int) []int {
	res := make([]int, len(s))
	for i, v := range s {
		res[len(s)-1-i] = v
	}
	return res
}

func generateCombinationsWasm(segs [][]SplitSegment) [][]SplitSegment {
	if len(segs) == 0 {
		return [][]SplitSegment{}
	}
	var helper func(idx int) [][]SplitSegment
	helper = func(idx int) [][]SplitSegment {
		if idx == len(segs) {
			return [][]SplitSegment{{}}
		}
		sub := helper(idx + 1)
		var res [][]SplitSegment
		for _, s := range segs[idx] {
			for _, combo := range sub {
				res = append(res, append([]SplitSegment{s}, combo...))
			}
		}
		return res
	}
	return helper(0)
}

func main() {
	c := make(chan struct{}, 0)

	js.Global().Set("prepareGraphBuffer", js.FuncOf(prepareGraphBuffer))
	js.Global().Set("initGraphFromBuffer", js.FuncOf(initGraphFromBuffer))
	js.Global().Set("reconstructAndCalculate", js.FuncOf(reconstructAndCalculate))

	<-c
}
