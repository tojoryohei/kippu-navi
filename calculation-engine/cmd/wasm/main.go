//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"math"
	"syscall/js"
	"unsafe"

	"calculation-engine/internal/domain"
	ticketgraphdata "calculation-engine/internal/graphdata"
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"calculation-engine/internal/pass/infra/fareio"
	"calculation-engine/internal/pass/usecase"
	ticketdomain "calculation-engine/internal/ticket/domain"
	ticketfare "calculation-engine/internal/ticket/fare"
	ticketgraph "calculation-engine/internal/ticket/graph"
	tickethandler "calculation-engine/internal/ticket/handler"
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
var ticketAmountCalc *ticketusecase.CalculateAmount
var ticketApplier *ticketusecase.SpecialZoneApplier
var ticketSegmentEvaluator *ticketusecase.TicketSegmentEvaluator
var ticketCorrector *ticketusecase.PipelineCorrector
var ticketHandler *tickethandler.Ticket

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
	Pad                    [1]byte
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
			},
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

	passWasmGraph = &WasmGraph{
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
	passBypassReg := passdomain.NewBypassRegistry()
	passBypassReg.Register(
		[]string{"大沼", "大沼公園", "赤井川", "駒ケ岳", "森"},
		[]string{"大沼", "鹿部", "渡島沼尻", "渡島砂原", "掛澗", "尾白内", "東森", "森"},
	)
	passBypassReg.Register(
		[]string{"日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽"},
		[]string{"日暮里", "尾久", "赤羽"},
	)
	passBypassReg.Register(
		[]string{"赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"},
		[]string{"赤羽", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "大宮"},
	)
	passBypassReg.Register(
		[]string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見"},
		[]string{"品川", "西大井", "武蔵小杉", "新川崎", "鶴見"},
	)
	passBypassReg.Register(
		[]string{"八代", "新八代", "千丁", "有佐", "小川", "松橋", "宇土"},
		[]string{"八代", "新八代", "宇土"},
	)
	passBypassReg.Register(
		[]string{"宇多津", "丸亀", "讃岐塩屋", "多度津"},
		[]string{"宇多津", "多度津"},
	)

	bypassRules, err = passBypassReg.ResolveIDs(func(name string) (int, bool) {
		return passBaseGraph.GetID(name)
	})
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ResolveIDs failed: %v", err))
	}
	initPassBypassRules()

	// 初期化完了に伴い、一時バッファへのピン留めを解除しGCに開放
	passTempBuffer = nil

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

type passBypassRule struct {
	detour   []int
	shortcut []int
}

var passBypassRules []passBypassRule

func initPassBypassRules() {
	rawRules := []struct {
		detour   []string
		shortcut []string
	}{
		{
			detour:   []string{"大沼", "鹿部", "渡島沼尻", "渡島砂原", "掛澗", "尾白内", "東森", "森"},
			shortcut: []string{"大沼", "大沼公園", "赤井川", "駒ケ岳", "森"},
		},
		{
			detour:   []string{"日暮里", "尾久", "赤羽"},
			shortcut: []string{"日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽"},
		},
		{
			detour:   []string{"赤羽", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "大宮"},
			shortcut: []string{"赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"},
		},
		{
			detour:   []string{"品川", "西大井", "武蔵小杉", "新川崎", "鶴見"},
			shortcut: []string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見"},
		},
	}

	passBypassRules = nil
	for _, r := range rawRules {
		detIDs := make([]int, len(r.detour))
		for i, name := range r.detour {
			id, _ := passWasmGraph.GetID(name)
			detIDs[i] = id
		}
		shIDs := make([]int, len(r.shortcut))
		for i, name := range r.shortcut {
			id, _ := passWasmGraph.GetID(name)
			shIDs[i] = id
		}
		passBypassRules = append(passBypassRules, passBypassRule{
			detour:   detIDs,
			shortcut: shIDs,
		})
	}
}

func applyNormalBypassCorrection(path []int) []int {
	for _, rule := range passBypassRules {
		if index, ok := findSubslice(path, rule.detour); ok {
			if !hasAnyInnerShortcut(path, rule.shortcut) {
				path, _ = replaceSubsliceAt(path, index, len(rule.detour), rule.shortcut)
			}
		} else if index, ok := findSubslice(path, reverseSlice(rule.detour)); ok {
			if !hasAnyInnerShortcut(path, rule.shortcut) {
				path, _ = replaceSubsliceAt(path, index, len(rule.detour), reverseSlice(rule.shortcut))
			}
		}
	}
	return path
}

func findSubslice(slice []int, target []int) (int, bool) {
	n := len(slice)
	m := len(target)
	if m == 0 || n < m {
		return -1, false
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
			return i, true
		}
	}
	return -1, false
}

func replaceSubsliceAt(slice []int, start, length int, newSeq []int) ([]int, bool) {
	res := make([]int, 0, len(slice)-length+len(newSeq))
	res = append(res, slice[:start]...)
	res = append(res, newSeq...)
	res = append(res, slice[start+length:]...)
	return res, true
}

func hasAnyInnerShortcut(path []int, shortcut []int) bool {
	inner := shortcut[1 : len(shortcut)-1]
	for _, sID := range inner {
		for _, pID := range path {
			if sID == pID {
				return true
			}
		}
	}
	return false
}

func generateCheapestCandidates(path []int) [][]int {
	var candidates [][]int
	normalPath := applyNormalBypassCorrection(path)
	candidates = append(candidates, normalPath)

	start := path[0]
	end := path[len(path)-1]

	var startExtensions [][]int
	for _, rule := range passBypassRules {
		if isStationInMiddle(start, rule.shortcut) {
			p1 := getSubpathOnRule(rule.shortcut, rule.shortcut[0], start)
			startExtensions = append(startExtensions, p1)
			p2 := getSubpathOnRule(rule.shortcut, rule.shortcut[len(rule.shortcut)-1], start)
			startExtensions = append(startExtensions, p2)
		}
		if isStationInMiddle(start, rule.detour) {
			p1 := getSubpathOnRule(rule.detour, rule.detour[0], start)
			startExtensions = append(startExtensions, p1)
			p2 := getSubpathOnRule(rule.detour, rule.detour[len(rule.detour)-1], start)
			startExtensions = append(startExtensions, p2)
		}
	}

	var endExtensions [][]int
	for _, rule := range passBypassRules {
		if isStationInMiddle(end, rule.shortcut) {
			p1 := getSubpathOnRule(rule.shortcut, end, rule.shortcut[0])
			endExtensions = append(endExtensions, p1)
			p2 := getSubpathOnRule(rule.shortcut, end, rule.shortcut[len(rule.shortcut)-1])
			endExtensions = append(endExtensions, p2)
		}
		if isStationInMiddle(end, rule.detour) {
			p1 := getSubpathOnRule(rule.detour, end, rule.detour[0])
			endExtensions = append(endExtensions, p1)
			p2 := getSubpathOnRule(rule.detour, end, rule.detour[len(rule.detour)-1])
			endExtensions = append(endExtensions, p2)
		}
	}

	var basePaths [][]int
	basePaths = append(basePaths, normalPath)

	for _, ext := range startExtensions {
		if len(ext) > 1 {
			cand := append([]int(nil), ext...)
			cand = append(cand, normalPath[1:]...)
			basePaths = append(basePaths, cand)
		}
	}

	var finalCandidates [][]int
	finalCandidates = append(finalCandidates, basePaths...)
	for _, bp := range basePaths {
		for _, ext := range endExtensions {
			if len(ext) > 1 {
				cand := append([]int(nil), bp...)
				cand = append(cand, ext[1:]...)
				finalCandidates = append(finalCandidates, cand)
			}
		}
	}

	var finalCorrected [][]int
	for _, cand := range finalCandidates {
		corr := applyNormalBypassCorrection(cand)
		if !containsPath(finalCorrected, corr) {
			finalCorrected = append(finalCorrected, corr)
		}
	}

	return finalCorrected
}

func isStationInMiddle(stationID int, rulePath []int) bool {
	if len(rulePath) < 3 {
		return false
	}
	for i := 1; i < len(rulePath)-1; i++ {
		if rulePath[i] == stationID {
			return true
		}
	}
	return false
}

func getSubpathOnRule(rulePath []int, from, to int) []int {
	fromIdx := -1
	toIdx := -1
	for i, id := range rulePath {
		if id == from {
			fromIdx = i
		}
		if id == to {
			toIdx = i
		}
	}
	if fromIdx == -1 || toIdx == -1 {
		return nil
	}

	if fromIdx < toIdx {
		res := make([]int, toIdx-fromIdx+1)
		copy(res, rulePath[fromIdx:toIdx+1])
		return res
	} else {
		res := make([]int, fromIdx-toIdx+1)
		for i := 0; i < len(res); i++ {
			res[i] = rulePath[fromIdx-i]
		}
		return res
	}
}

func isPathValidWasm(path []int) bool {
	if len(path) < 2 {
		return true
	}
	firstPart := path[:len(path)-1]
	seen := make(map[int]bool)
	for _, id := range firstPart {
		if seen[id] {
			return false
		}
		seen[id] = true
	}
	return true
}

func calculateRoutePass(this js.Value, args []js.Value) interface{} {
	stationNamesJson := args[0].String()
	months := args[1].Int()
	isIc := args[2].Bool()
	calculationMode := args[3].String()

	if isIc {
		activeGraph = icGraph
		passActiveAmountCalc = passIcAmountCalc
	} else {
		activeGraph = passBaseGraph
		passActiveAmountCalc = passBaseAmountCalc
	}

	var stationNames []string
	if err := json.Unmarshal([]byte(stationNamesJson), &stationNames); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error":"JSON unmarshal failed: %v"}`, err))
	}

	if len(stationNames) < 2 {
		return js.ValueOf(`{"error":"at least 2 stations required"}`)
	}

	stationIDs := make([]int, len(stationNames))
	for i, name := range stationNames {
		id, ok := passWasmGraph.GetID(name)
		if !ok {
			return js.ValueOf(fmt.Sprintf(`{"error":"station not found: %s"}`, name))
		}
		stationIDs[i] = id
	}

	var finalPath []int
	if calculationMode == "uncorrect" {
		finalPath = stationIDs
	} else if calculationMode == "normal" {
		finalPath = applyNormalBypassCorrection(stationIDs)
	} else if calculationMode == "cheapest" {
		cands := generateCheapestCandidates(stationIDs)
		minFare := math.MaxInt
		var bestPath []int
		for _, cand := range cands {
			if !isPathValidWasm(cand) {
				continue
			}
			res, err := passActiveAmountCalc.Execute(cand, months)
			if err != nil {
				continue
			}
			fare := res.TotalAmount()
			if fare < minFare {
				minFare = fare
				bestPath = cand
			}
		}
		if bestPath == nil {
			finalPath = applyNormalBypassCorrection(stationIDs)
		} else {
			finalPath = bestPath
		}
	} else {
		finalPath = applyNormalBypassCorrection(stationIDs)
	}

	res, err := passActiveAmountCalc.Execute(finalPath, months)
	if err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error":"calculation failed: %v"}`, err))
	}

	viaList := usecase.GetVia(passWasmGraph, finalPath)

	correctedPathNames := make([]string, len(finalPath))
	for i, id := range finalPath {
		correctedPathNames[i] = passWasmGraph.GetName(id)
	}

	type RoutePassResponse struct {
		Fare            int      `json:"fare"`
		BarrierFreeFee  int      `json:"barrierFreeFee"`
		Charge          int      `json:"charge"`
		TotalEigyoKilo  int      `json:"totalEigyoKilo"`
		PrintedViaLines []string `json:"printedViaLines"`
		CorrectedPath   []string `json:"correctedPath"`
		Error           string   `json:"error,omitempty"`
	}

	resp := RoutePassResponse{
		Fare:            res.Fare,
		BarrierFreeFee:  res.BarrierFreeFee,
		Charge:          res.Charge,
		TotalEigyoKilo:  int(res.TotalEigyoKilo),
		PrintedViaLines: viaList,
		CorrectedPath:   correctedPathNames,
	}

	resBytes, _ := json.Marshal(resp)
	return js.ValueOf(string(resBytes))
}

func main() {
	c := make(chan struct{})

	js.Global().Set("preparePassGraphBuffer", js.FuncOf(preparePassGraphBuffer))
	js.Global().Set("initPassGraphFromBuffer", js.FuncOf(initPassGraphFromBuffer))
	js.Global().Set("prepareTicketGraphBuffer", js.FuncOf(prepareTicketGraphBuffer))
	js.Global().Set("initTicketGraphFromBuffer", js.FuncOf(initTicketGraphFromBuffer))
	js.Global().Set("reconstructAndCalculate", js.FuncOf(reconstructAndCalculate))
	js.Global().Set("calculateRoutePass", js.FuncOf(calculateRoutePass))
	js.Global().Set("calculateRouteTicket", js.FuncOf(calculateRouteTicket))

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

	// ticketFullGraph の構築
	ticketFullGraph = &ticketgraph.RailwayGraph{
		FastGraph: &ticketgraph.FastGraph{
			Edges: make([][]ticketdomain.TicketEdge, numStations),
		},
		StationNameIDMapper: &ticketgraph.StationNameIDMapper{
			NameToID: make(map[string]int, numStations),
			IDToName: make([]string, numStations),
		},
	}
	for i := 0; i < int(numStations); i++ {
		ticketFullGraph.IDToName[i] = ticketWasmGraph.GetName(i)
		ticketFullGraph.NameToID[ticketWasmGraph.GetName(i)] = i
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
	}

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
	for _, z := range ticketZoneReg.Zones {
		ticketFullGraph.GetOrAddID(z.Name)
	}

	ticketFareReg := ticketfare.NewRegistry()
	ticketFareioReg, err := ticketfareio.NewRegistry()
	if err != nil {
		return js.ValueOf(fmt.Sprintf("error: ticket fareio load failed: %v", err))
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
			_ = ticketSpecificMatcher.Insert(ids, f.Fare)
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
			_ = ticketAdjustedMatcher.Insert(ids, f.Fare)
		}
	}

	ticketAddonFareReg := ticketfare.NewAddonRegistry()
	ticketAddonFareReg.Register("南千歳", "新千歳空港", 20)
	ticketAddonFareReg.Register("日根野", "りんくうタウン", 150)
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
		ticketArticle70Routes,
	)

	ticketApplier = ticketusecase.NewSpecialZoneApplier(ticketFullGraph, ticketZoneReg)
	ticketSegmentEvaluator = ticketusecase.NewTicketSegmentEvaluator(
		ticketAmountCalc,
		ticketApplier,
		ticketusecase.NewPostZoneCleanupCorrector(),
		ticketZoneReg,
		ticketFullGraph,
	)

	ticketCorrector = ticketusecase.NewPipelineCorrector(
		ticketusecase.NewShinkansenOverlapCorrector(),
		ticketusecase.NewRule43_2Corrector(),
		ticketusecase.NewRule69Corrector(),
		ticketusecase.NewRule157Corrector(),
	)

	ticketHandler = tickethandler.NewTicket(ticketFullGraph, ticketCorrector, ticketSegmentEvaluator)

	// 初期化完了に伴い、一時バッファへのピン留めを解除しGCに開放
	ticketTempBuffer = nil

	return js.ValueOf("ok")
}

func calculateRouteTicket(this js.Value, args []js.Value) interface{} {
	var start float64
	if perf := js.Global().Get("performance"); perf.Truthy() {
		start = perf.Call("now").Float()
	}

	if ticketHandler == nil {
		return js.ValueOf(`{"error": "ticket graph not initialized"}`)
	}

	if len(args) < 1 {
		return js.ValueOf(`{"error": "invalid arguments"}`)
	}

	jsonStr := args[0].String()

	var req tickethandler.RouteRequest
	if err := json.Unmarshal([]byte(jsonStr), &req); err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "invalid json: %s"}`, err.Error()))
	}

	var pathIDs []int
	for _, p := range req.FullPath {
		if id, ok := ticketFullGraph.GetID(p.StationName); ok {
			pathIDs = append(pathIDs, id)
		} else {
			return js.ValueOf(fmt.Sprintf(`{"error": "駅が見つかりません: %s"}`, p.StationName))
		}
	}

	correctedPath, err := ticketCorrector.Correct(pathIDs, ticketFullGraph)
	if err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "経路補正エラー: %v"}`, err))
	}

	evaluationResult, err := ticketSegmentEvaluator.Execute(correctedPath, 0)
	if err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "運賃計算エラー: %v"}`, err))
	}

	var printStrings = []string{} // 経由印字は未実装

	depStation := ticketFullGraph.GetName(evaluationResult.FinalPath[0])
	arrStation := ticketFullGraph.GetName(evaluationResult.FinalPath[len(evaluationResult.FinalPath)-1])

	// 有効日数の計算（JR・他社線の合計営業キロから算出）
	validDays := ticketdomain.CalculateValidDaysFromKilo(evaluationResult.TotalPathEigyoKilo)

	var elapsed float64
	if perf := js.Global().Get("performance"); perf.Truthy() {
		elapsed = perf.Call("now").Float() - start
	}

	resp := tickethandler.RouteResponse{
		Data: tickethandler.KippuData{
			Fare:             evaluationResult.TotalAmount(),
			ValidDays:        validDays,
			TotalEigyoKilo:   int(evaluationResult.TotalPathEigyoKilo),
			DepartureStation: depStation,
			ArrivalStation:   arrStation,
			PrintedViaLines:  printStrings,
		},
		Time: elapsed,
	}

	respBytes, err := json.Marshal(resp)
	if err != nil {
		return js.ValueOf(fmt.Sprintf(`{"error": "JSONエンコードエラー: %v"}`, err))
	}

	return js.ValueOf(string(respBytes))
}
