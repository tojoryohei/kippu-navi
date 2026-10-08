//go:build js && wasm

package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"syscall/js"
	"time"
	"unsafe"

	"calculation-engine/internal/domain"
	ticketgraphdata "calculation-engine/internal/graphdata"
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"calculation-engine/internal/pass/infra/fareio"
	"calculation-engine/internal/pass/optimizer"
	"calculation-engine/internal/pass/usecase"
	"calculation-engine/internal/split"
	ticketdomain "calculation-engine/internal/ticket/domain"
	ticketfare "calculation-engine/internal/ticket/fare"
	ticketgraph "calculation-engine/internal/ticket/graph"
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
	"io"
)

// passTempBuffer は定期券JSから書き込まれるバッファ
var passTempBuffer []byte

// ticketTempBuffer は乗車券JSから書き込まれるバッファ
var ticketTempBuffer []byte

// passWasmGraph はロードされたバイナリグラフのグローバルインスタンス（定期券用）
var passGraphInitialized bool
var passWasmGraph *WasmGraph

// ticketWasmGraph は乗車券用のWasmGraph
var ticketWasmGraph *WasmGraph

var passBaseGraph *graph.RailwayGraph
var icGraph *graph.RailwayGraph
var passBaseAmountCalc *usecase.CalculateAmount
var passIcAmountCalc *usecase.CalculateAmount
var bypassRules []passdomain.ResolvedBypassRule

// 乗車券用のグローバルコンポーネント
var ticketFullGraph *ticketgraph.RailwayGraph
var ticketSearchGraph *ticketgraph.RailwayGraph
var ticketAmountCalc *ticketusecase.CalculateAmount
var ticketApplier *ticketusecase.SpecialZoneApplier
var ticketSegmentEvaluator *ticketusecase.TicketSegmentEvaluator
var ticketCorrector *ticketusecase.PipelineCorrector
var ticketRouteExtensions *ticketusecase.RouteExtensionMatcher
var ticketZoneRegistry *ticketgraphio.SpecialZoneRegistry
var ticketGraphInitialized bool

// 実行中のコンテキスト
var activeGraph *graph.RailwayGraph
var passActiveAmountCalc *usecase.CalculateAmount

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
	IsBoldLineArea         bool
	SuburbanArea           uint8
}

// WasmGraph はバイナリデータからキャストされたグラフデータを提供する Graph 実装
type WasmGraph struct {
	lineByPair  map[[2]int]string
	numStations int32
	numEdges    int32
	indptr      []int32
	indices     []int32
	edgeData    []EdgeBinary
	nameOffsets []int32
	namesBlob   []byte
	nameMap     map[string]int32
}

func (g *WasmGraph) GetEdges(id int) []passdomain.PassEdge {
	if id < 0 || id >= int(g.numStations) {
		return nil
	}
	start := g.indptr[id]
	end := g.indptr[id+1]
	ebs := g.edgeData[start:end]

	edges := make([]passdomain.PassEdge, len(ebs))
	for i, eb := range ebs {
		edges[i] = passdomain.PassEdge{
			Edge: domain.Edge{
				FromID:                 id,
				ToID:                   int(eb.ToID),
				EigyoKilo:              domain.DeciKilo(eb.EigyoKilo),
				GiseiKilo:              domain.DeciKilo(eb.GiseiKilo),
				Company:                domain.CompanyID(eb.Company),
				IsLocal:                eb.IsLocal,
				IsTrainSpecificSection: eb.IsTrainSpecificSection,
				IsBarrierFreeSection:   eb.IsBarrierFreeSection,
				SuburbanArea:           domain.SuburbanAreaID(eb.SuburbanArea),
			},
			Line:           g.lineByPair[[2]int{id, int(eb.ToID)}],
			IsIcPassArea:   eb.IsIcPassArea,
			IsBoldLineArea: eb.IsBoldLineArea,
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

// 定期券用JavaScript バインディング
func preparePassGraphBuffer(this js.Value, args []js.Value) interface{} {
	size := args[0].Int()
	passTempBuffer = make([]byte, size)
	ptr := uintptr(unsafe.Pointer(&passTempBuffer[0]))
	return js.ValueOf(int(ptr))
}

func initPassGraphFromBuffer(this js.Value, args []js.Value) interface{} {
	passGraphInitialized = false
	if len(passTempBuffer) < 16 {
		return js.ValueOf("error: buffer is too small")
	}

	magic := string(passTempBuffer[:8])
	if magic != "WASMGRA\x00" {
		return js.ValueOf(fmt.Sprintf("error: invalid magic header: %q", magic))
	}

	numStations := *(*int32)(unsafe.Pointer(&passTempBuffer[8]))
	numEdges := *(*int32)(unsafe.Pointer(&passTempBuffer[12]))

	offsetIndptr := 16
	offsetIndices := offsetIndptr + int(numStations+1)*4
	offsetEdgeData := offsetIndices + int(numEdges)*4
	offsetNameOffsets := offsetEdgeData + int(numEdges)*16
	offsetNamesBlob := offsetNameOffsets + int(numStations+1)*4

	indptr := unsafe.Slice((*int32)(unsafe.Pointer(&passTempBuffer[offsetIndptr])), numStations+1)
	indices := unsafe.Slice((*int32)(unsafe.Pointer(&passTempBuffer[offsetIndices])), numEdges)
	edgeData := unsafe.Slice((*EdgeBinary)(unsafe.Pointer(&passTempBuffer[offsetEdgeData])), numEdges)
	nameOffsets := unsafe.Slice((*int32)(unsafe.Pointer(&passTempBuffer[offsetNameOffsets])), numStations+1)
	namesBlob := passTempBuffer[offsetNamesBlob : offsetNamesBlob+int(nameOffsets[numStations])]

	nameMap := make(map[string]int32, numStations)
	for i := 0; i < int(numStations); i++ {
		start := nameOffsets[i]
		end := nameOffsets[i+1]
		name := string(namesBlob[start:end])
		nameMap[name] = int32(i)
	}

	// バイナリ形式には路線コードがないため、同梱の駅間データから補う。
	var lineRecords []struct {
		Line     string `json:"line"`
		Station0 string `json:"station0"`
		Station1 string `json:"station1"`
	}
	if err := json.NewDecoder(ticketgraphdata.GetEdgesReader()).Decode(&lineRecords); err != nil {
		return js.ValueOf(fmt.Sprintf("error: pass line data: %v", err))
	}
	lineByPair := make(map[[2]int]string, len(lineRecords)*2)
	for _, record := range lineRecords {
		from, ok0 := nameMap[record.Station0]
		to, ok1 := nameMap[record.Station1]
		if ok0 && ok1 {
			lineByPair[[2]int{int(from), int(to)}] = record.Line
			lineByPair[[2]int{int(to), int(from)}] = record.Line
		}
	}
	passWasmGraph = &WasmGraph{
		lineByPair:  lineByPair,
		numStations: numStations,
		numEdges:    numEdges,
		indptr:      indptr,
		indices:     indices,
		edgeData:    edgeData,
		nameOffsets: nameOffsets,
		namesBlob:   namesBlob,
		nameMap:     nameMap,
	}

	// passBaseGraph の構築
	passBaseGraph = &graph.RailwayGraph{
		FastGraph: &graph.FastGraph{
			Edges: make([][]passdomain.PassEdge, numStations),
		},
		StationNameIDMapper: &graph.StationNameIDMapper{
			NameToID: make(map[string]int, numStations),
			IDToName: make([]string, numStations),
		},
	}
	for i := 0; i < int(numStations); i++ {
		passBaseGraph.IDToName[i] = passWasmGraph.GetName(i)
		passBaseGraph.NameToID[passWasmGraph.GetName(i)] = i
		passBaseGraph.Edges[i] = passWasmGraph.GetEdges(i)
	}

	// icGraph の構築
	ic, err := graph.NewIcPassGraph(passBaseGraph)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: NewIcPassGraph failed: %v", err))
	}
	icGraph = ic

	// passBaseAmountCalc の構築
	passBaseCalcs, err := fareio.InitRegistry(passBaseGraph)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: InitRegistry failed: %v", err))
	}

	passAddonFareReg := passdomain.NewAddonRegistry()
	passAddonFareReg.Register("南千歳", "新千歳空港", passdomain.PassPrice{OneMonth: 660, ThreeMonth: 1880, SixMonth: 3180})
	passAddonFareReg.Register("日根野", "りんくうタウン", passdomain.PassPrice{OneMonth: 4690, ThreeMonth: 13320, SixMonth: 22440})
	passAddonFareReg.Register("日根野", "関西空港", passdomain.PassPrice{OneMonth: 6640, ThreeMonth: 18900, SixMonth: 31820})
	passAddonFareReg.Register("りんくうタウン", "関西空港", passdomain.PassPrice{OneMonth: 5010, ThreeMonth: 14250, SixMonth: 24000})
	passAddonFareReg.Register("児島", "宇多津", passdomain.PassPrice{OneMonth: 1610, ThreeMonth: 4600, SixMonth: 8170})
	passAddonFareReg.Register("田吉", "宮崎空港", passdomain.PassPrice{OneMonth: 3840, ThreeMonth: 10960, SixMonth: 18680})

	passAddonFareReg.ResolveIDs(func(name string) (int, bool) {
		return passBaseGraph.GetID(name)
	})

	passAddonChargeReg := passdomain.NewAddonRegistry()
	passAddonChargeReg.Register("博多", "博多南", passdomain.PassPrice{OneMonth: 4680, ThreeMonth: 13340, SixMonth: 25270})
	passAddonChargeReg.ResolveIDs(func(name string) (int, bool) {
		return passBaseGraph.GetID(name)
	})

	passPrivateFareReg, err := fareio.NewPrivateFareRegistry()
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: passPrivateFareRegistry Init failed: %v", err))
	}

	passBaseAmountCalc = usecase.NewCalculateAmount(
		passBaseGraph,
		passBaseCalcs.Registry,
		passAddonFareReg,
		passAddonChargeReg,
		passBaseCalcs.TrainSpecific,
		passBaseCalcs.SpecificRoute,
		passBaseCalcs.AdjustedRoute,
		passPrivateFareReg,
	)

	// passIcAmountCalc の構築
	passIcCalcs, err := fareio.InitRegistry(icGraph)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ic InitRegistry failed: %v", err))
	}
	passIcAmountCalc = usecase.NewCalculateAmount(
		icGraph,
		passIcCalcs.Registry,
		passAddonFareReg,
		passAddonChargeReg,
		passIcCalcs.TrainSpecific,
		passIcCalcs.SpecificRoute,
		passIcCalcs.AdjustedRoute,
		passPrivateFareReg,
	)

	// 特例ルールの設定
	passBypassReg := passdomain.NewDefaultBypassRegistry()
	bypassRules, err = passBypassReg.ResolveIDs(func(name string) (int, bool) {
		return passBaseGraph.GetID(name)
	})
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ResolveIDs failed: %v", err))
	}

	// 初期化完了に伴い、一時バッファへのピン留めを解除しGCに開放
	passTempBuffer = nil
	passGraphInitialized = true

	return js.ValueOf(true)
}

func reconstructAndCalculate(this js.Value, args []js.Value) interface{} {
	splitStationsJson := args[0].String()
	months := args[1].Int()
	isIc := args[2].Bool()

	if isIc {
		activeGraph = icGraph
		passActiveAmountCalc = passIcAmountCalc
	} else {
		activeGraph = passBaseGraph
		passActiveAmountCalc = passBaseAmountCalc
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
		id, ok := passWasmGraph.GetID(name)
		if !ok {
			return js.ValueOf(fmt.Sprintf(`{"error":"station not found: %s"}`, name))
		}
		splitIDs[i] = id
	}

	var allSegCandidates [][]SplitSegment
	for i := 0; i < len(splitIDs)-1; i++ {
		segs, err := getCheapestNoSplitSegmentsWasm(splitIDs[i], splitIDs[i+1], months, true)
		if err != nil {
			return js.ValueOf(fmt.Sprintf(`{"error":"failed to get segments: %v"}`, err))
		}
		allSegCandidates = append(allSegCandidates, segs)
	}

	combinations := generateCombinationsWasm(allSegCandidates)

	type SegmentResponse struct {
		Path           []string                   `json:"path"`
		Via            []string                   `json:"via"`
		Result         *usecase.CalculationResult `json:"result"`
		TotalEigyoKilo domain.DeciKilo            `json:"totalEigyoKilo"`
		Start          string                     `json:"start"`
		End            string                     `json:"end"`
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
				pathNames[k] = passWasmGraph.GetName(id)
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
				Start:          passWasmGraph.GetName(seg.StartStationID),
				End:            passWasmGraph.GetName(seg.EndStationID),
			})
		}
		clientResults = append(clientResults, ResultResponse{
			TotalAmount: totalAmount,
			Segments:    apiSegments,
		})
	}

	// 通常経路（分割なし）の算出
	normalSegs, err := getCheapestNoSplitSegmentsWasm(splitIDs[0], splitIDs[len(splitIDs)-1], months, false)
	var normalResult ResultResponse
	if err == nil && len(normalSegs) > 0 {
		seg := normalSegs[0]
		pathNames := make([]string, len(seg.Path))
		for k, id := range seg.Path {
			pathNames[k] = passWasmGraph.GetName(id)
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
					Start:          passWasmGraph.GetName(seg.StartStationID),
					End:            passWasmGraph.GetName(seg.EndStationID),
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

func getCheapestNoSplitSegmentsWasm(start, end, months int, allowOvershoot bool) ([]SplitSegment, error) {
	// 最短経路を検索
	shortest, err := activeGraph.FindShortestPathGisei(start, end)
	if err != nil {
		return nil, fmt.Errorf("wasm: FindShortestPathGisei に失敗しました: %w", err)
	}

	maxGisei := shortest.GiseiKilo + 50
	pathsResult, err := activeGraph.FindKShortestPathsGisei(start, end, 10, maxGisei)
	if err != nil {
		return nil, fmt.Errorf("wasm: FindKShortestPathsGisei に失敗しました: %w", err)
	}

	dfsPaths := make([][]int, len(pathsResult))
	for i, pr := range pathsResult {
		dfsPaths[i] = pr.StationIDs
	}

	bypassPaths := getBypassCandidatesWasm(start, end, allowOvershoot)

	allPaths := append(dfsPaths, bypassPaths...)

	var validPaths [][]int
	for _, path := range allPaths {
		if !checkMixedRouteConflictWasm(path) {
			continue
		}
		if isPureDetourPathWasm(path) {
			continue
		}
		if !containsPath(validPaths, path) {
			validPaths = append(validPaths, path)
		}
	}

	if len(validPaths) == 0 {
		return nil, fmt.Errorf("wasm: 有効な経路が見つかりませんでした")
	}

	minFare := math.MaxInt
	var bestPaths [][]int
	var bestResults []*usecase.CalculationResult

	for _, path := range validPaths {
		res, err := passActiveAmountCalc.Execute(path, months)
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
		return nil, fmt.Errorf("wasm: すべての経路で運賃計算に失敗しました")
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

func containsSubsliceWasm(slice []int, target []int) bool {
	n := len(slice)
	m := len(target)
	if m == 0 || n < m {
		return false
	}
	for i := 0; i <= n-m; i++ {
		match := true
		for j := 0; j < m; j++ {
			if slice[i+j] != target[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}

func isPureDetourPathWasm(path []int) bool {
	for _, rule := range bypassRules {
		hasInnerShortcut := false
		if len(rule.ShortcutPath) > 2 {
			inner := rule.ShortcutPath[1 : len(rule.ShortcutPath)-1]
			for _, sID := range inner {
				for _, pID := range path {
					if sID == pID {
						hasInnerShortcut = true
						break
					}
				}
				if hasInnerShortcut {
					break
				}
			}
		}

		if hasInnerShortcut {
			continue
		}

		if containsSubsliceWasm(path, rule.DetourPath) || containsSubsliceWasm(path, reverseSlice(rule.DetourPath)) {
			return true
		}
	}
	return false
}

func getBypassCandidatesWasm(start, end int, allowOvershoot bool) [][]int {
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

	if !allowOvershoot {
		return cands
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

func isOnDetourMiddle(stationID int, rule passdomain.ResolvedBypassRule) bool {
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

// calculateRoutePass は、運賃計算と経路指定分割で定期券の補正・運賃評価を共用します。
func calculateRoutePass(this js.Value, args []js.Value) interface{} {
	if len(args) < 4 || passBaseGraph == nil {
		return routeTicketError(fmt.Errorf("定期券エンジンが準備されていません"))
	}
	var names []string
	if err := json.Unmarshal([]byte(args[0].String()), &names); err != nil {
		return routeTicketError(err)
	}
	calc := passBaseAmountCalc
	if args[2].Bool() {
		calc = passIcAmountCalc
	}
	// 経由表示は従来のpassWasmGraphと同じ全路線のグラフを使う。
	calculator := usecase.NewRoutePassCalculator(passBaseGraph, calc, bypassRules)
	path, err := calculator.ResolvePath(names)
	if err != nil {
		return routeTicketError(err)
	}
	result, err := calculator.Calculate(path, args[1].Int(), args[3].String())
	if err != nil {
		return routeTicketError(err)
	}
	data, err := json.Marshal(result)
	if err != nil {
		return routeTicketError(err)
	}
	return js.ValueOf(string(data))
}

func calculateRouteSplitPass(this js.Value, args []js.Value) interface{} {
	start := time.Now()
	if len(args) < 1 || passBaseGraph == nil {
		return routeTicketError(fmt.Errorf("定期券エンジンが準備されていません"))
	}
	var req struct {
		split.RouteSplitOptions
		CandidatesOnly  bool     `json:"candidatesOnly"`
		StationNames    []string `json:"stationNames"`
		Months          int      `json:"months"`
		CalculationMode string   `json:"calculationMode"`
	}
	if err := json.Unmarshal([]byte(args[0].String()), &req); err != nil {
		return routeTicketError(err)
	}
	calculator := usecase.NewRoutePassCalculator(passBaseGraph, passBaseAmountCalc, bypassRules)
	if req.CandidatesOnly {
		names, err := calculator.SplitCandidates(req.StationNames, req.CalculationMode)
		if err != nil {
			return routeTicketError(err)
		}
		data, _ := json.Marshal(names)
		return js.ValueOf(string(data))
	}
	if len(args) > 1 && args[1].Type() == js.TypeFunction {
		callback := args[1]
		req.Progress = func(progress split.Progress) {
			callback.Invoke(progress.Phase, progress.Completed, progress.Total)
		}
	}
	result, err := calculator.Split(req.StationNames, req.Months, req.CalculationMode, req.RouteSplitOptions)
	if err != nil {
		return routeTicketError(err)
	}
	data, err := json.Marshal(struct {
		Data *split.RouteSplitResult `json:"data"`
		Time float64                 `json:"time"`
	}{result, float64(time.Since(start).Microseconds()) / 1000})
	if err != nil {
		return routeTicketError(err)
	}
	return js.ValueOf(string(data))
}

// ticketSplitPresentation は近郊区間内の計算済み結果をそのまま印字に使います。
func ticketSplitPresentation(seg ticketusecase.TicketSplitSegment) ([]int, *ticketusecase.CalculationResult, []string) {
	if ticketusecase.IsSuburbanAreaComplete(seg.SourcePath, ticketFullGraph) {
		return seg.Path, seg.Result, ticketusecase.GetAutomaticFareViaForResult(ticketFullGraph, seg.Path, seg.Result.FinalPath)
	}
	// 近郊区間外は従来の表示用補正を維持する。
	path, _ := ticketCorrector.Correct(seg.Path, ticketFullGraph)
	if len(path) == 0 {
		path = seg.Path
	}
	result, transformed, _ := ticketSegmentEvaluator.Execute(path, 0)
	if result != nil {
		path = transformed
	} else {
		result = seg.Result
	}
	return path, result, ticketusecase.GetSplitViaForResult(ticketFullGraph, seg.Path, path)
}

func reconstructAndCalculateTicket(this js.Value, args []js.Value) interface{} {
	splitStationsJson := args[0].String()

	var splitNames []string
	if err := json.Unmarshal([]byte(splitStationsJson), &splitNames); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error":"JSON unmarshal failed: %v"}`, err))
	}

	if len(splitNames) < 2 {
		return js.ValueOf(`{"error":"at least 2 stations required"}`)
	}

	splitIDs := make([]int, len(splitNames))
	for i, name := range splitNames {
		id, ok := ticketFullGraph.GetID(name)
		if !ok {
			return js.ValueOf(fmt.Sprintf(`{"error":"station not found: %s"}`, name))
		}
		splitIDs[i] = id
	}

	search := ticketusecase.NewSearchOptimalSplit(ticketSearchGraph, ticketSegmentEvaluator)

	var allSegCandidates [][]ticketusecase.TicketSplitSegment
	for i := 0; i < len(splitIDs)-1; i++ {
		segs, err := search.GetCheapestTicketSegments(splitIDs[i], splitIDs[i+1])
		if err != nil {
			return js.ValueOf(fmt.Sprintf(`{"error":"failed to get segments: %v"}`, err))
		}
		allSegCandidates = append(allSegCandidates, segs)
	}

	// generate combinations
	var combinations [][]ticketusecase.TicketSplitSegment
	var current []ticketusecase.TicketSplitSegment
	var backtrack func(depth int)
	backtrack = func(depth int) {
		if depth == len(allSegCandidates) {
			combo := make([]ticketusecase.TicketSplitSegment, len(current))
			copy(combo, current)
			combinations = append(combinations, combo)
			return
		}
		for _, seg := range allSegCandidates[depth] {
			current = append(current, seg)
			backtrack(depth + 1)
			current = current[:len(current)-1]
		}
	}
	if len(allSegCandidates) > 0 {
		backtrack(0)
	}

	type SegmentResponse struct {
		Path           []string                         `json:"path"`
		Via            []string                         `json:"via"`
		Result         *ticketusecase.CalculationResult `json:"result"`
		TotalEigyoKilo domain.DeciKilo                  `json:"totalEigyoKilo"`
		Start          string                           `json:"start"`
		End            string                           `json:"end"`
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
			correctedPath, correctedResult, viaNames := ticketSplitPresentation(seg)

			pathNames := make([]string, len(correctedPath))
			for k, id := range correctedPath {
				pathNames[k] = ticketFullGraph.GetName(id)
			}
			var eigyo domain.DeciKilo
			if correctedResult != nil {
				eigyo = correctedResult.TotalEigyoKilo
			}
			fare := correctedResult.TotalAmount()
			totalAmount += fare

			apiSegments = append(apiSegments, SegmentResponse{
				Path:           pathNames,
				Via:            viaNames,
				Result:         seg.Result,
				TotalEigyoKilo: eigyo,
				Start:          ticketFullGraph.GetName(seg.StartStationID),
				End:            ticketFullGraph.GetName(seg.EndStationID),
			})
		}
		clientResults = append(clientResults, ResultResponse{
			TotalAmount: totalAmount,
			Segments:    apiSegments,
		})
	}

	// 通常経路（分割なし）の算出
	normalSegs, err := search.GetCheapestTicketSegments(splitIDs[0], splitIDs[len(splitIDs)-1])
	var normalResult ResultResponse
	if err == nil && len(normalSegs) > 0 {
		seg := normalSegs[0]
		correctedPath, correctedResult, viaNames := ticketSplitPresentation(seg)

		pathNames := make([]string, len(correctedPath))
		for k, id := range correctedPath {
			pathNames[k] = ticketFullGraph.GetName(id)
		}
		var eigyo domain.DeciKilo
		if correctedResult != nil {
			eigyo = correctedResult.TotalEigyoKilo
		}

		normalResult = ResultResponse{
			TotalAmount: correctedResult.TotalAmount(),
			Segments: []SegmentResponse{
				{
					Path:           pathNames,
					Via:            viaNames,
					Result:         correctedResult,
					TotalEigyoKilo: eigyo,
					Start:          ticketFullGraph.GetName(seg.StartStationID),
					End:            ticketFullGraph.GetName(seg.EndStationID),
				},
			},
		}
	}

	resp := ClientResponse{
		Normal:  normalResult,
		Results: clientResults,
	}

	respJSON, err := json.Marshal(resp)
	if err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error":"JSON marshal failed: %v"}`, err))
	}

	return js.ValueOf(string(respJSON))
}

func main() {
	c := make(chan struct{})

	js.Global().Set("preparePassGraphBuffer", js.FuncOf(preparePassGraphBuffer))
	js.Global().Set("initPassGraphFromBuffer", js.FuncOf(initPassGraphFromBuffer))
	js.Global().Set("prepareTicketGraphBuffer", js.FuncOf(prepareTicketGraphBuffer))
	js.Global().Set("initTicketGraphFromBuffer", js.FuncOf(initTicketGraphFromBuffer))
	js.Global().Set("reconstructAndCalculate", js.FuncOf(reconstructAndCalculate))
	js.Global().Set("reconstructAndCalculateTicket", js.FuncOf(reconstructAndCalculateTicket))
	js.Global().Set("calculateRoutePass", js.FuncOf(calculateRoutePass))
	js.Global().Set("calculateRouteSplitPass", js.FuncOf(calculateRouteSplitPass))
	js.Global().Set("calculateRouteTicket", js.FuncOf(calculateRouteTicket))
	js.Global().Set("calculateRouteSplitTicket", js.FuncOf(calculateRouteSplitTicket))
	js.Global().Set("calculateOptimalSplitTicket", js.FuncOf(calculateOptimalSplitTicket))
	js.Global().Set("calculateOptimalSplitPass", js.FuncOf(calculateOptimalSplitPass))

	<-c
}

// 乗車券用のJSバインディング
func prepareTicketGraphBuffer(this js.Value, args []js.Value) interface{} {
	size := args[0].Int()
	ticketTempBuffer = make([]byte, size)
	ptr := uintptr(unsafe.Pointer(&ticketTempBuffer[0]))
	return js.ValueOf(int(ptr))
}

func initTicketGraphFromBuffer(this js.Value, args []js.Value) interface{} {
	ticketGraphInitialized = false
	if len(ticketTempBuffer) < 16 {
		return js.ValueOf("error: buffer is too small")
	}

	magic := string(ticketTempBuffer[:8])
	if magic != "WASMGRA\x00" {
		return js.ValueOf(fmt.Sprintf("error: invalid magic header: %q", magic))
	}

	numStations := *(*int32)(unsafe.Pointer(&ticketTempBuffer[8]))
	numEdges := *(*int32)(unsafe.Pointer(&ticketTempBuffer[12]))

	offsetIndptr := 16
	offsetIndices := offsetIndptr + int(numStations+1)*4
	offsetEdgeData := offsetIndices + int(numEdges)*4
	offsetNameOffsets := offsetEdgeData + int(numEdges)*16
	offsetNamesBlob := offsetNameOffsets + int(numStations+1)*4

	indptr := unsafe.Slice((*int32)(unsafe.Pointer(&ticketTempBuffer[offsetIndptr])), numStations+1)
	indices := unsafe.Slice((*int32)(unsafe.Pointer(&ticketTempBuffer[offsetIndices])), numEdges)
	edgeData := unsafe.Slice((*EdgeBinary)(unsafe.Pointer(&ticketTempBuffer[offsetEdgeData])), numEdges)
	nameOffsets := unsafe.Slice((*int32)(unsafe.Pointer(&ticketTempBuffer[offsetNameOffsets])), numStations+1)
	namesBlob := ticketTempBuffer[offsetNamesBlob : offsetNamesBlob+int(nameOffsets[numStations])]

	nameMap := make(map[string]int32, numStations)
	for i := 0; i < int(numStations); i++ {
		start := nameOffsets[i]
		end := nameOffsets[i+1]
		name := string(namesBlob[start:end])
		nameMap[name] = int32(i)
	}

	ticketWasmGraph = &WasmGraph{
		numStations: numStations,
		numEdges:    numEdges,
		indptr:      indptr,
		indices:     indices,
		edgeData:    edgeData,
		nameOffsets: nameOffsets,
		namesBlob:   namesBlob,
		nameMap:     nameMap,
	}

	ticketFullGraph = &ticketgraph.RailwayGraph{
		FastGraph: &ticketgraph.FastGraph{
			Edges:              make([][]ticketdomain.TicketEdge, numStations),
			PhysicalEdgeCounts: make([]int, numStations),
		},
		StationNameIDMapper: &ticketgraph.StationNameIDMapper{
			NameToID: make(map[string]int, numStations),
			IDToName: make([]string, numStations),
		},
	}
	for i := 0; i < int(numStations); i++ {
		name := ticketWasmGraph.GetName(i)
		ticketFullGraph.IDToName[i] = name
		ticketFullGraph.NameToID[name] = i
		// WasmGraph から PassEdge を取り出し、TicketEdge に変換する
		passEdges := ticketWasmGraph.GetEdges(i)
		ticketEdges := make([]ticketdomain.TicketEdge, len(passEdges))
		for j, pe := range passEdges {
			ticketEdges[j] = ticketdomain.TicketEdge{
				Edge:           pe.Edge,
				IsBoldLineArea: pe.IsBoldLineArea,
			}
		}
		ticketFullGraph.Edges[i] = ticketEdges
		ticketFullGraph.PhysicalEdgeCounts[i] = len(ticketEdges)
	}
	if err := (&ticketgraphio.JSONLoader{}).AddVirtualEdges(ticketFullGraph, ticketgraphdata.GetFareGraphEdgeReaders()...); err != nil {
		return js.ValueOf(fmt.Sprintf("error: failed to add virtual ticket edges: %v", err))
	}
	ticketSearchGraph = ticketgraph.NewPhysicalGraphView(ticketFullGraph)

	// 乗車券コンポーネント初期化
	zoneRoutesBytes, err := io.ReadAll(ticketgraphdata.GetZoneRoutesReader())
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: failed to read zone routes data: %v", err))
	}
	ticketZoneRoutes, err := ticketdomain.LoadZoneRoutesFromBytes(zoneRoutesBytes)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ticket zone routes load failed: %v", err))
	}

	arBytes, err := io.ReadAll(ticketgraphdata.GetArticle70RoutesReader())
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: failed to read article70 routes data: %v", err))
	}
	ticketArticle70Routes, err := ticketdomain.LoadArticle70RoutesFromBytes(arBytes)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ticket article70 routes load failed: %v", err))
	}

	ticketZoneReg, err := ticketgraphio.LoadSpecialZones()
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: LoadSpecialZones failed: %v", err))
	}
	ticketZoneRegistry = ticketZoneReg
	for _, z := range ticketZoneReg.Zones {
		ticketFullGraph.GetOrAddID(z.Name)
	}
	for _, zoneName := range ticketZoneRoutes.ZoneNames() {
		ticketFullGraph.GetOrAddID(zoneName)
	}

	ticketFareReg := ticketfare.NewRegistry()
	ticketFareioReg, err := ticketfareio.NewRegistry()
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ticket fareio load failed: %v", err))
	}
	ticketRouteExtensions, err = ticketusecase.NewRouteExtensionMatcherIDs(ticketfareio.GetGeneratedRouteExtensions(), ticketFullGraph)
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: route extension data initialization failed: %v", err))
	}

	ticketSpecificMatcher := ticketfare.NewPathMatcher()
	for _, f := range ticketFareioReg.GetSpecificFares() {
		ids := make([]int, 0, len(f.Path))
		for _, name := range f.Path {
			id, ok := ticketFullGraph.GetID(name)
			if ok {
				ids = append(ids, id)
			}
		}
		if len(ids) == len(f.Path) {
			if err := ticketSpecificMatcher.Insert(ids, f.Fare); err != nil {
				return js.ValueOf(fmt.Sprintf("エラー: 特定運賃の登録に失敗しました (経路: %v): %v", f.Path, err))
			}
		}
	}

	ticketAdjustedMatcher := ticketfare.NewPathMatcher()
	for _, f := range ticketFareioReg.GetAdjustedFares() {
		ids := make([]int, 0, len(f.Path))
		for _, name := range f.Path {
			id, ok := ticketFullGraph.GetID(name)
			if ok {
				ids = append(ids, id)
			}
		}
		if len(ids) == len(f.Path) {
			if err := ticketAdjustedMatcher.Insert(ids, f.Fare); err != nil {
				return js.ValueOf(fmt.Sprintf("エラー: 調整運賃の登録に失敗しました (経路: %v): %v", f.Path, err))
			}
		}
	}

	ticketAddonFareReg := ticketfare.NewAddonRegistry()
	ticketAddonFareReg.Register("南千歳", "新千歳空港", 20)
	ticketAddonFareReg.Register("日根野", "りんくうタウン", 160)
	ticketAddonFareReg.Register("りんくうタウン", "関西空港", 170)
	ticketAddonFareReg.Register("日根野", "関西空港", 220)
	ticketAddonFareReg.Register("児島", "宇多津", 110)
	ticketAddonFareReg.Register("田吉", "宮崎空港", 130)

	if err := ticketAddonFareReg.ResolveIDs(func(name string) (int, bool) {
		return ticketFullGraph.GetID(name)
	}); err != nil {
		return js.ValueOf(fmt.Sprintf("error: ticket addon fare resolve failed: %v", err))
	}

	ticketPrivateFareReg, err := ticketfareio.NewPrivateFareRegistry()
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: private fare load failed: %v", err))
	}

	ticketTrainSpecificCalc := ticketfare.NewTrainSpecificSectionCalculator()

	ticketAmountCalc = ticketusecase.NewCalculateAmount(
		ticketFareReg,
		ticketAddonFareReg,
		ticketTrainSpecificCalc,
		ticketSpecificMatcher,
		ticketAdjustedMatcher,
		ticketPrivateFareReg,
		ticketFullGraph,
		ticketZoneRoutes,
	)

	ticketApplier = ticketusecase.NewSpecialZoneApplier(ticketFullGraph, ticketZoneReg)
	ticketSegmentEvaluator = ticketusecase.NewTicketSegmentEvaluator(
		ticketAmountCalc,
		ticketApplier,
		ticketusecase.NewPostZoneCleanupCorrector(),
		ticketZoneReg,
		ticketFullGraph,
	)

	// 経路補正候補を、運賃特例適用後の通常モードの運賃で比較する。
	// Correctorには物理経路だけを返すため、評価器が返す変換後経路は破棄する。
	fareEval := func(path []int) (int, error) {
		res, _, err := ticketSegmentEvaluator.ExecuteWithMode(path, 0, "normal")
		if err != nil {
			return 0, err
		}
		return res.TotalAmount(), nil
	}

	ticketCorrector = ticketusecase.NewPipelineCorrector(
		ticketusecase.NewSuburbanAreaCorrector(fareEval),
		ticketusecase.NewShinkansenOverlapCorrector(),
		ticketusecase.NewRule43_2Corrector(),
		ticketusecase.NewRule69Corrector(),
		ticketusecase.NewRule157Corrector(),
		ticketusecase.NewArticle70Corrector(ticketArticle70Routes),
	)

	ticketSegmentEvaluator.SetSplitCorrector(ticketCorrector)

	ticketGraphInitialized = true

	// 初期化完了に伴い、一時バッファへのピン留めを解除しGCに開放
	ticketWasmGraph = nil
	ticketTempBuffer = nil

	return js.ValueOf("ok")
}

func calculateRouteTicket(this js.Value, args []js.Value) interface{} {
	var start float64
	if perf := js.Global().Get("performance"); perf.Truthy() {
		start = perf.Call("now").Float()
	}

	if !ticketGraphInitialized {
		return js.ValueOf(`{"error": "ticket graph not initialized"}`)
	}

	if len(args) < 1 {
		return js.ValueOf(`{"error": "invalid arguments"}`)
	}

	jsonStr := args[0].String()

	var req RouteRequest
	if err := json.Unmarshal([]byte(jsonStr), &req); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "invalid json: %s"}`, err.Error()))
	}

	calculator := ticketusecase.NewRouteTicketCalculator(ticketFullGraph, ticketCorrector, ticketSegmentEvaluator, ticketRouteExtensions, ticketZoneRegistry)
	pathIDs, err := calculator.ResolvePath(req.ViaSteps())
	if err != nil {
		return routeTicketError(err)
	}
	fare, _, err := calculator.Calculate(pathIDs, req.ViaSteps(), req.CalculationMode)
	if err != nil {
		return routeTicketError(err)
	}

	var elapsed float64
	if perf := js.Global().Get("performance"); perf.Truthy() {
		elapsed = perf.Call("now").Float() - start
	}

	resp := struct {
		Data ticketusecase.RouteTicketFare `json:"data"`
		Time float64                       `json:"time"`
	}{fare, elapsed}

	respBytes, err := json.Marshal(resp)
	if err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "JSONエンコードエラー: %v"}`, err))
	}

	return js.ValueOf(string(respBytes))
}

func calculateOptimalSplitTicket(this js.Value, args []js.Value) interface{} {
	if !ticketGraphInitialized {
		return js.ValueOf(`{"error":"ticket graph not initialized"}`)
	}
	startName := args[0].String()
	endName := args[1].String()
	maxSections := 0
	if len(args) > 2 && args[2].Type() == js.TypeNumber {
		maxSplits := args[2].Int()
		if maxSplits < 0 || maxSplits > 10 {
			return js.ValueOf(`{"error":"maxSplitsは0以上10以下で指定してください"}`)
		}
		if maxSplits > 0 {
			maxSections = maxSplits + 1
		}
	}
	var lockedNames []string
	if len(args) > 3 && args[3].Type() == js.TypeString && args[3].String() != "" {
		if err := json.Unmarshal([]byte(args[3].String()), &lockedNames); err != nil {
			return js.ValueOf(fmt.Sprintf(`{"error":"noSplitStationの解析に失敗しました: %v"}`, err))
		}
	}

	startID, ok := ticketFullGraph.GetID(startName)
	if !ok {
		return js.ValueOf(fmt.Sprintf(`{"error":"station not found: %s"}`, startName))
	}
	endID, ok := ticketFullGraph.GetID(endName)
	if !ok {
		return js.ValueOf(fmt.Sprintf(`{"error":"station not found: %s"}`, endName))
	}
	lockedStations := make([]int, 0, len(lockedNames))
	seenLocked := make(map[int]struct{}, len(lockedNames))
	for _, name := range lockedNames {
		id, exists := ticketFullGraph.GetID(name)
		if !exists {
			return js.ValueOf(fmt.Sprintf(`{"error":"station not found: %s"}`, name))
		}
		if _, exists := seenLocked[id]; exists {
			continue
		}
		seenLocked[id] = struct{}{}
		lockedStations = append(lockedStations, id)
	}

	search := ticketusecase.NewSearchOptimalSplit(ticketSearchGraph, ticketSegmentEvaluator)

	bestResultPaths, err := search.ExecuteWithOptions(startID, endID, maxSections, lockedStations)
	if err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error":"failed to search optimal split: %v"}`, err))
	}

	type SegmentResponse struct {
		Path           []string                         `json:"path"`
		Via            []string                         `json:"via"`
		Result         *ticketusecase.CalculationResult `json:"result"`
		TotalEigyoKilo domain.DeciKilo                  `json:"totalEigyoKilo"`
		Start          string                           `json:"start"`
		End            string                           `json:"end"`
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

	for _, splitIDs := range bestResultPaths {
		var allSegCandidates [][]ticketusecase.TicketSplitSegment
		for i := 0; i < len(splitIDs)-1; i++ {
			segs, err := search.GetCheapestTicketSegments(splitIDs[i], splitIDs[i+1])
			if err != nil {
				continue
			}
			allSegCandidates = append(allSegCandidates, segs)
		}
		if len(allSegCandidates) != len(splitIDs)-1 {
			continue
		}

		var combinations [][]ticketusecase.TicketSplitSegment
		var current []ticketusecase.TicketSplitSegment
		var backtrack func(depth int)
		backtrack = func(depth int) {
			if depth == len(allSegCandidates) {
				combo := make([]ticketusecase.TicketSplitSegment, len(current))
				copy(combo, current)
				combinations = append(combinations, combo)
				return
			}
			for _, seg := range allSegCandidates[depth] {
				current = append(current, seg)
				backtrack(depth + 1)
				current = current[:len(current)-1]
			}
		}
		if len(allSegCandidates) > 0 {
			backtrack(0)
		}

		for _, combo := range combinations {
			var apiSegments []SegmentResponse
			totalAmount := 0
			for _, seg := range combo {
				correctedPath, correctedResult, viaNames := ticketSplitPresentation(seg)

				pathNames := make([]string, len(correctedPath))
				for k, id := range correctedPath {
					pathNames[k] = ticketFullGraph.GetName(id)
				}
				var eigyo domain.DeciKilo
				if correctedResult != nil {
					eigyo = correctedResult.TotalEigyoKilo
				}
				fare := correctedResult.TotalAmount()
				totalAmount += fare

				apiSegments = append(apiSegments, SegmentResponse{
					Path:           pathNames,
					Via:            viaNames,
					Result:         correctedResult,
					TotalEigyoKilo: eigyo,
					Start:          ticketFullGraph.GetName(seg.StartStationID),
					End:            ticketFullGraph.GetName(seg.EndStationID),
				})
			}
			clientResults = append(clientResults, ResultResponse{
				TotalAmount: totalAmount,
				Segments:    apiSegments,
			})
		}
	}

	// Normal result
	normalSegs, err := search.GetCheapestTicketSegments(startID, endID)
	var normalResult ResultResponse
	if err == nil && len(normalSegs) > 0 {
		seg := normalSegs[0]
		correctedPath, correctedResult, viaNames := ticketSplitPresentation(seg)

		pathNames := make([]string, len(correctedPath))
		for k, id := range correctedPath {
			pathNames[k] = ticketFullGraph.GetName(id)
		}
		var eigyo domain.DeciKilo
		if correctedResult != nil {
			eigyo = correctedResult.TotalEigyoKilo
		}

		normalResult = ResultResponse{
			TotalAmount: correctedResult.TotalAmount(),
			Segments: []SegmentResponse{
				{
					Path:           pathNames,
					Via:            viaNames,
					Result:         correctedResult,
					TotalEigyoKilo: eigyo,
					Start:          ticketFullGraph.GetName(seg.StartStationID),
					End:            ticketFullGraph.GetName(seg.EndStationID),
				},
			},
		}
	}

	resp := ClientResponse{
		Normal:  normalResult,
		Results: clientResults,
	}

	respJSON, err := json.Marshal(resp)
	if err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error":"JSON marshal failed: %v"}`, err))
	}

	return js.ValueOf(string(respJSON))
}

func routeTicketError(err error) interface{} {
	data, _ := json.Marshal(map[string]string{"error": err.Error()})
	return js.ValueOf(string(data))
}

func calculateRouteSplitTicket(this js.Value, args []js.Value) interface{} {
	start := time.Now()
	if !ticketGraphInitialized {
		return routeTicketError(errors.New("ticket graph not initialized"))
	}
	if len(args) < 1 {
		return routeTicketError(errors.New("invalid arguments"))
	}
	var req struct {
		RouteRequest
		split.RouteSplitOptions
		CandidatesOnly bool `json:"candidatesOnly"`
	}
	if err := json.Unmarshal([]byte(args[0].String()), &req); err != nil {
		return routeTicketError(err)
	}
	calculator := ticketusecase.NewRouteTicketCalculator(ticketFullGraph, ticketCorrector, ticketSegmentEvaluator, ticketRouteExtensions, ticketZoneRegistry)
	if req.CandidatesOnly {
		names, err := calculator.SplitCandidateDetails(req.ViaSteps(), req.CalculationMode)
		if err != nil {
			return routeTicketError(err)
		}
		data, _ := json.Marshal(names)
		return js.ValueOf(string(data))
	}
	if len(args) > 1 && args[1].Type() == js.TypeFunction {
		callback := args[1]
		req.Progress = func(progress split.Progress) {
			callback.Invoke(progress.Phase, progress.Completed, progress.Total)
		}
	}
	result, err := calculator.Split(req.ViaSteps(), req.CalculationMode, req.RouteSplitOptions)
	if err != nil {
		return routeTicketError(err)
	}
	data, err := json.Marshal(struct {
		Data *ticketusecase.RouteSplitResult `json:"data"`
		Time float64                         `json:"time"`
	}{result, float64(time.Since(start).Microseconds()) / 1000})
	if err != nil {
		return routeTicketError(err)
	}
	return js.ValueOf(string(data))
}

// calculateOptimalSplitPass はAPIと同形式の分割駅列を返し、既存の結果復元を利用します。
func calculateOptimalSplitPass(this js.Value, args []js.Value) interface{} {
	fail := func(message string) interface{} {
		b, _ := json.Marshal(map[string]string{"error": message})
		return js.ValueOf(string(b))
	}
	if !passGraphInitialized {
		return fail("pass graph not initialized")
	}
	if len(args) != 1 {
		return fail("invalid request")
	}
	var req struct {
		From            string   `json:"from"`
		To              string   `json:"to"`
		Months          int      `json:"months"`
		IsIc            bool     `json:"isIc"`
		MaxSplits       int      `json:"maxSplits"`
		NoSplitStations []string `json:"noSplitStations"`
	}
	if err := json.Unmarshal([]byte(args[0].String()), &req); err != nil {
		return fail(err.Error())
	}
	if req.Months != 1 && req.Months != 3 && req.Months != 6 {
		return fail("定期券の期間が不正です")
	}
	if !req.IsIc && (req.MaxSplits < 0 || req.MaxSplits > 10) {
		return fail("分割回数が不正です")
	}
	g := passBaseGraph
	maxSections := 0
	if req.IsIc {
		g = icGraph
		maxSections = 2
	} else if req.MaxSplits > 0 {
		maxSections = req.MaxSplits + 1
	}
	start, okStart := g.GetID(req.From)
	end, okEnd := g.GetID(req.To)
	if !okStart || !okEnd {
		return fail("存在しない駅名が含まれています")
	}
	if start == end {
		return fail("出発駅と到着駅が同じです")
	}
	if g.GetGroupID(start) == 0 || g.GetGroupID(start) != g.GetGroupID(end) {
		return fail(domain.DisconnectedRouteErrorMessage)
	}
	var locked []int
	for _, name := range req.NoSplitStations {
		id, ok := g.GetID(name)
		if !ok {
			return fail("存在しない分割禁止駅名が含まれています")
		}
		locked = append(locked, id)
	}
	// APIのIC事前計算も基底グラフの運賃計算器とIC探索グラフの組み合わせ。
	split := usecase.NewFindOptimalSplit(optimizer.NewDPOptimizer(passBaseAmountCalc), passBaseAmountCalc)
	search := usecase.NewOnDemandSearch(g, split, bypassRules, maxSections)
	paths, err := search.ExecuteWithOptions(start, end, req.Months, maxSections, locked)
	if err != nil {
		return fail(err.Error())
	}
	results := make([][]string, 0, len(paths))
	for _, path := range paths {
		names := make([]string, len(path))
		for i, id := range path {
			names[i] = g.GetName(id)
		}
		results = append(results, names)
	}
	response, err := json.Marshal(struct {
		Normal  []string   `json:"normal"`
		Results [][]string `json:"results"`
	}{[]string{req.From, req.To}, results})
	if err != nil {
		return fail(err.Error())
	}
	return js.ValueOf(string(response))
}
