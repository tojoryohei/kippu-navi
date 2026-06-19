package main

import (
	"compress/gzip"
	"encoding/binary"
	"fmt"
	"log"
	"math"
	"os"
	"runtime"
	"sync"

	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/infra/graphio"
	"split-pass-api/internal/usecase"
)

func main() {
	if err := run(os.Args); err != nil {
		log.Fatalf("エラーが発生しました: %v", err)
	}
	log.Println("事前計算が完了しました。")
}

func run(args []string) error {
	if len(args) < 3 {
		return fmt.Errorf("使用法: precompute-fares <入力JSON> <出力BIN.GZ>")
	}

	inputJSON := args[1]
	outputBinGz := args[2]

	log.Printf("JSONファイルを読み込んでいます: %s", inputJSON)
	inFile, err := os.Open(inputJSON)
	if err != nil {
		return fmt.Errorf("JSONファイルのオープンに失敗しました: %w", err)
	}
	defer inFile.Close()

	jsonLoader := &graphio.JSONLoader{}
	baseGraph, err := jsonLoader.Load(inFile)
	if err != nil {
		return fmt.Errorf("JSONの読み込みに失敗しました: %w", err)
	}

	numStations := baseGraph.NumStations()
	log.Printf("駅数 = %d", numStations)

	// 運賃計算機の初期化
	calcs, err := fareio.InitRegistry(baseGraph)
	if err != nil {
		return fmt.Errorf("運賃計算レジストリの初期化に失敗しました: %w", err)
	}

	// 加算運賃の登録（本番と同様）
	addonFareReg := domain.NewAddonRegistry()
	addonFareReg.Register("南千歳", "新千歳空港", domain.PassPrice{OneMonth: 660, ThreeMonth: 1880, SixMonth: 3180})
	addonFareReg.Register("日根野", "りんくうタウン", domain.PassPrice{OneMonth: 4690, ThreeMonth: 13320, SixMonth: 22440})
	addonFareReg.Register("日根野", "関西空港", domain.PassPrice{OneMonth: 6640, ThreeMonth: 18900, SixMonth: 31820})
	addonFareReg.Register("りんくうタウン", "関西空港", domain.PassPrice{OneMonth: 5010, ThreeMonth: 14250, SixMonth: 24000})
	addonFareReg.Register("児島", "宇多津", domain.PassPrice{OneMonth: 1610, ThreeMonth: 4600, SixMonth: 8170})
	addonFareReg.Register("田吉", "宮崎空港", domain.PassPrice{OneMonth: 3840, ThreeMonth: 10960, SixMonth: 18680})

	if err := addonFareReg.ResolveIDs(func(name string) (int, bool) {
		return baseGraph.GetID(name)
	}); err != nil {
		return fmt.Errorf("加算運賃のID解決に失敗しました: %w", err)
	}

	// 特急料金の登録
	addonChargeReg := domain.NewAddonRegistry()
	addonChargeReg.Register("博多", "博多南", domain.PassPrice{OneMonth: 4680, ThreeMonth: 13340, SixMonth: 25270})

	if err := addonChargeReg.ResolveIDs(func(name string) (int, bool) {
		return baseGraph.GetID(name)
	}); err != nil {
		return fmt.Errorf("特急料金のID解決に失敗しました: %w", err)
	}

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

	bypassRules, err := bypassReg.ResolveIDs(func(name string) (int, bool) {
		return baseGraph.GetID(name)
	})
	if err != nil {
		return fmt.Errorf("特例ルールのID解決に失敗しました: %w", err)
	}

	// 双方向ルールの重複排除
	rules := makeUniqueBidirectionalRules(bypassRules)

	amountCalc := usecase.NewCalculateAmount(
		baseGraph,
		calcs.Registry,
		addonFareReg,
		addonChargeReg,
		calcs.TrainSpecific,
		calcs.SpecificRoute,
		calcs.AdjustedRoute,
	)

	// ICグラフの構築
	icGraph, err := graph.NewIcPassGraph(baseGraph)
	if err != nil {
		return fmt.Errorf("ICグラフの生成に失敗しました: %w", err)
	}

	log.Println("全点対最短経路を事前計算しています...")
	// Base & IC の Gisei/Eigyo 最短経路前移行配列を計算
	basePrevGisei := make([][]int, numStations)
	basePrevEigyo := make([][]int, numStations)
	icPrevGisei := make([][]int, numStations)
	icPrevEigyo := make([][]int, numStations)

	var wg sync.WaitGroup
	sem := make(chan struct{}, runtime.NumCPU())

	for i := 0; i < numStations; i++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(startID int) {
			defer wg.Done()
			defer func() { <-sem }()

			if len(baseGraph.Edges[startID]) > 0 {
				_, pG := baseGraph.FindAllShortestPathsGisei(startID)
				_, pE := baseGraph.FindAllShortestPathsEigyo(startID)
				basePrevGisei[startID] = pG
				basePrevEigyo[startID] = pE
			}

			if len(icGraph.Edges[startID]) > 0 {
				_, pG := icGraph.FindAllShortestPathsGisei(startID)
				_, pE := icGraph.FindAllShortestPathsEigyo(startID)
				icPrevGisei[startID] = pG
				icPrevEigyo[startID] = pE
			}
		}(i)
	}
	wg.Wait()

	log.Println("運賃マトリクスを事前計算しています（並列処理）...")
	baseFares := make([]int32, 3*numStations*numStations)
	icFares := make([]int32, 3*numStations*numStations)

	months := []int{1, 3, 6}

	// Base グラフの運賃計算
	var wgFares sync.WaitGroup
	for mIdx, month := range months {
		for i := 0; i < numStations; i++ {
			wgFares.Add(1)
			sem <- struct{}{}
			go func(mIdx, month, startID int) {
				defer wgFares.Done()
				defer func() { <-sem }()

				for endID := 0; endID < numStations; endID++ {
					if startID == endID {
						continue
					}
					if baseGraph.GetGroupID(startID) != baseGraph.GetGroupID(endID) {
						continue
					}

					// 最短経路が求められているかチェック
					if basePrevGisei[startID] == nil || basePrevGisei[startID][endID] == -1 {
						continue
					}

					fareVal := computeCheapestNoSplit(baseGraph, amountCalc, rules, basePrevGisei[startID], basePrevEigyo[startID], startID, endID, month)
					if fareVal > 0 {
						idx := int32(mIdx)*int32(numStations)*int32(numStations) + int32(startID)*int32(numStations) + int32(endID)
						baseFares[idx] = int32(fareVal)
					}
				}
			}(mIdx, month, i)
		}
	}
	wgFares.Wait()

	// IC グラフの運賃計算
	for mIdx, month := range months {
		for i := 0; i < numStations; i++ {
			wgFares.Add(1)
			sem <- struct{}{}
			go func(mIdx, month, startID int) {
				defer wgFares.Done()
				defer func() { <-sem }()

				for endID := 0; endID < numStations; endID++ {
					if startID == endID {
						continue
					}
					if icGraph.GetGroupID(startID) != icGraph.GetGroupID(endID) {
						continue
					}

					if icPrevGisei[startID] == nil || icPrevGisei[startID][endID] == -1 {
						continue
					}

					fareVal := computeCheapestNoSplit(icGraph, amountCalc, rules, icPrevGisei[startID], icPrevEigyo[startID], startID, endID, month)
					if fareVal > 0 {
						idx := int32(mIdx)*int32(numStations)*int32(numStations) + int32(startID)*int32(numStations) + int32(endID)
						icFares[idx] = int32(fareVal)
					}
				}
			}(mIdx, month, i)
		}
	}
	wgFares.Wait()

	log.Printf("バイナリファイルを書き出しています: %s", outputBinGz)
	outFile, err := os.Create(outputBinGz)
	if err != nil {
		return fmt.Errorf("出力ファイルの作成に失敗しました: %w", err)
	}
	defer outFile.Close()

	gzWriter := gzip.NewWriter(outFile)
	defer gzWriter.Close()

	// ヘッダー書き込み
	// Magic
	if _, err := gzWriter.Write([]byte("FARES")); err != nil {
		return fmt.Errorf("Magicの書き込みに失敗しました: %w", err)
	}
	// NumStations
	if err := binary.Write(gzWriter, binary.LittleEndian, int32(numStations)); err != nil {
		return fmt.Errorf("駅数の書き込みに失敗しました: %w", err)
	}

	// BaseFares
	if err := binary.Write(gzWriter, binary.LittleEndian, baseFares); err != nil {
		return fmt.Errorf("BaseFaresの書き込みに失敗しました: %w", err)
	}

	// IcFares
	if err := binary.Write(gzWriter, binary.LittleEndian, icFares); err != nil {
		return fmt.Errorf("IcFaresの書き込みに失敗しました: %w", err)
	}

	return nil
}

func computeCheapestNoSplit(
	g *graph.RailwayGraph,
	calc *usecase.CalculateAmount,
	rules []domain.ResolvedBypassRule,
	prevGisei, prevEigyo []int,
	start, end, months int,
) int {
	var cands [][]int
	var lockedList [][]bool

	// ① 最短営業キロ
	pathEigyo := reconstructPath(prevEigyo, start, end)
	if len(pathEigyo) >= 2 {
		cands = append(cands, pathEigyo)
		lockedList = append(lockedList, make([]bool, len(pathEigyo)))
	}

	// ② 最短擬制キロ
	pathGisei := reconstructPath(prevGisei, start, end)
	if len(pathGisei) >= 2 {
		cands = append(cands, pathGisei)
		lockedList = append(lockedList, make([]bool, len(pathGisei)))
	}

	// ③ 経路全体が1つの特例に含まれる場合のみ、近道の経路
	for _, rule := range rules {
		aOnRule := containsStation(rule.ShortcutPath, start) || containsStation(rule.DetourPath, start)
		bOnRule := containsStation(rule.ShortcutPath, end) || containsStation(rule.DetourPath, end)
		if aOnRule && bOnRule {
			aOnDetourMiddle := isOnDetourMiddle(start, rule)
			bOnDetourMiddle := isOnDetourMiddle(end, rule)
			if aOnDetourMiddle || bOnDetourMiddle {
				shortcutPath := make([]int, len(rule.ShortcutPath))
				copy(shortcutPath, rule.ShortcutPath)
				cands = append(cands, shortcutPath)
				lockedList = append(lockedList, makeShortcutLocked(shortcutPath))
			}
		}
	}

	// ④ 発着駅が遠回り上にあるが、完全に内包されていない場合、経由していない方の分岐駅まで特例の近道経路
	for _, path := range [][]int{pathEigyo, pathGisei} {
		if len(path) < 2 {
			continue
		}
		for _, rule := range rules {
			startOnDetour := isOnDetourMiddle(path[0], rule)
			endOnDetour := isOnDetourMiddle(path[len(path)-1], rule)
			if startOnDetour || endOnDetour {
				if findSubPath(path, rule.DetourPath) == -1 {
					locked := make([]bool, len(path))
					extPath, extLocked := buildOvershootPath(path, locked, rule)
					if extPath != nil {
						cands = append(cands, extPath)
						lockedList = append(lockedList, extLocked)
					}
				}
			}
		}
	}

	minFare := math.MaxInt
	for i, cand := range cands {
		res, err := calc.Execute(cand, months)
		if err != nil {
			continue
		}
		// locked がある場合は、分割計算FindOptimalSplitで計算すべき（つまりこの区間をそのまま通しで買うべきかどうか）
		// ここでは「非分割」の通し運賃だけを比較するため、そのまま calc.Execute の結果の TotalAmount を利用してよい
		amt := res.TotalAmount()
		// ただし、もし locked を尊重した運賃がある場合（特急料金など）も calc.Execute は正しく計算してくれる
		// 特例運賃などは locked スライス自体は calc.Execute では使わない（calc.Execute は単一の path から運賃を計算するだけだから）
		// ですので、Locked の影響（分割禁止）は分割ロジックである Dijkstra 上で
		// 「分割点をその中間に置くことを禁止する（エッジを引かない）」形で表現されます。
		// そのため、非分割運賃の事前計算時は locked 配列は無視して単に path の通し運賃を計算してOKです。
		_ = lockedList[i]
		if amt < minFare {
			minFare = amt
		}
	}

	if minFare == math.MaxInt {
		return 0
	}
	return minFare
}

func reconstructPath(prev []int, start, end int) []int {
	if prev == nil || end < 0 || end >= len(prev) || prev[end] == -1 {
		if start == end {
			return []int{start}
		}
		return nil
	}
	path := []int{}
	for i := end; i != -1; i = prev[i] {
		path = append(path, i)
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	return path
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

func makeShortcutLocked(shortcutPath []int) []bool {
	locked := make([]bool, len(shortcutPath))
	for k := 1; k < len(shortcutPath)-1; k++ {
		locked[k] = true
	}
	return locked
}

func findSubPath(a, b []int) int {
	if len(b) == 0 || len(a) < len(b) {
		return -1
	}
	for i := 0; i <= len(a)-len(b); i++ {
		if isMatch(a[i:i+len(b)], b) {
			return i
		}
	}
	return -1
}

func isMatch(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func buildOvershootPath(path []int, locked []bool, rule domain.ResolvedBypassRule) ([]int, []bool) {
	// 始点のオーバーシュート判定
	for i := 1; i < len(rule.DetourPath)-1; i++ {
		suffix := rule.DetourPath[i:]
		if len(path) >= len(suffix) && isMatch(path[:len(suffix)], suffix) {
			newPath := make([]int, 0, len(rule.ShortcutPath)+len(path)-len(suffix))
			newLocked := make([]bool, 0, cap(newPath))

			newPath = append(newPath, rule.ShortcutPath...)
			newLocked = append(newLocked, makeShortcutLocked(rule.ShortcutPath)...)

			newPath = append(newPath, path[len(suffix):]...)
			newLocked = append(newLocked, locked[len(suffix):]...)

			return newPath, newLocked
		}
	}

	// 終点のオーバーシュート判定
	for i := 1; i < len(rule.DetourPath)-1; i++ {
		prefix := rule.DetourPath[:i+1]
		if len(path) >= len(prefix) {
			startMatchIdx := len(path) - len(prefix)
			if isMatch(path[startMatchIdx:], prefix) {
				newPath := make([]int, 0, startMatchIdx+len(rule.ShortcutPath))
				newLocked := make([]bool, 0, cap(newPath))

				newPath = append(newPath, path[:startMatchIdx]...)
				newLocked = append(newLocked, locked[:startMatchIdx]...)

				newPath = append(newPath, rule.ShortcutPath...)
				newLocked = append(newLocked, makeShortcutLocked(rule.ShortcutPath)...)

				return newPath, newLocked
			}
		}
	}

	return nil, nil
}

func makeUniqueBidirectionalRules(rules []domain.ResolvedBypassRule) []domain.ResolvedBypassRule {
	var biRules []domain.ResolvedBypassRule
	seen := make(map[string]bool)

	for _, r := range rules {
		fwdKey := fmt.Sprintf("%v|%v", r.ShortcutPath, r.DetourPath)
		if !seen[fwdKey] {
			seen[fwdKey] = true
			biRules = append(biRules, r)
		}

		revShortcut := reverseSlice(r.ShortcutPath)
		revDetour := reverseSlice(r.DetourPath)
		revKey := fmt.Sprintf("%v|%v", revShortcut, revDetour)

		if !seen[revKey] {
			seen[revKey] = true
			biRules = append(biRules, domain.ResolvedBypassRule{
				ShortcutPath: revShortcut,
				DetourPath:   revDetour,
			})
		}
	}
	return biRules
}

func reverseSlice(s []int) []int {
	res := make([]int, len(s))
	for i, v := range s {
		res[len(s)-1-i] = v
	}
	return res
}
