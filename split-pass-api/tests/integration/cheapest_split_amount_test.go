package integration_test

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/graph/data"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/infra/graphio"
	"split-pass-api/internal/optimizer"
	"split-pass-api/internal/usecase"
	"strings"
	"testing"
)

// edgesMockJSON は本番データがない場合に使用する軽量モックグラフの JSON
const edgesMockJSON = `[
	{"station0": "テスト大宮", "station1": "テスト浦和", "eigyoKilo": 100, "giseiKilo": 100, "isLocal": false, "company": 2, "isTrainSpecificSection": false, "isBarrierFreeSection": false, "isIcPassArea": true},
	{"station0": "テスト浦和", "station1": "テスト赤羽", "eigyoKilo": 100, "giseiKilo": 100, "isLocal": false, "company": 2, "isTrainSpecificSection": false, "isBarrierFreeSection": false, "isIcPassArea": true},
	{"station0": "テスト赤羽", "station1": "テスト東京", "eigyoKilo": 100, "giseiKilo": 100, "isLocal": false, "company": 2, "isTrainSpecificSection": false, "isBarrierFreeSection": false, "isIcPassArea": true}
]`

// isMockMode は本番バイナリがなくてモック実行中かどうかを判定するグローバルフラグ
var isMockMode bool

func reconstructPath(prev []int, start, end int) []int {
	path := []int{}
	for curr := end; curr != -1; curr = prev[curr] {
		path = append([]int{curr}, path...)
		if curr == start {
			break
		}
	}
	return path
}

func generateMockPrecomputedBin(t testing.TB, g *graph.RailwayGraph, destPath string) {
	numStations := g.NumStations()

	basePrevGisei := make([][]int, numStations)
	baseDistGisei := make([][]domain.DeciKilo, numStations)

	for i := 0; i < numStations; i++ {
		dG, pG := g.FindAllShortestPathsGisei(i)
		basePrevGisei[i] = pG
		baseDistGisei[i] = dG
	}

	calcs, err := fareio.InitRegistryWithOptions(g, true)
	if err != nil {
		t.Fatalf("InitRegistry failed: %v", err)
	}

	amountCalc := usecase.NewCalculateAmount(
		g, calcs.Registry, domain.NewAddonRegistry(), domain.NewAddonRegistry(),
		calcs.TrainSpecific, calcs.SpecificRoute, calcs.AdjustedRoute,
	)

	baseFares := make([]int32, 3*numStations*numStations)
	months := []int{1, 3, 6}

	for mIdx, month := range months {
		for i := 0; i < numStations; i++ {
			for j := 0; j < numStations; j++ {
				if i == j {
					continue
				}
				if basePrevGisei[i] == nil || basePrevGisei[i][j] == -1 {
					continue
				}

				path := reconstructPath(basePrevGisei[i], i, j)
				res, err := amountCalc.Execute(path, month)
				if err == nil {
					fareVal := res.TotalAmount()
					idx := int32(mIdx)*int32(numStations)*int32(numStations) + int32(i)*int32(numStations) + int32(j)
					baseFares[idx] = int32(fareVal)
				}
			}
		}
	}

	outFile, err := os.Create(destPath)
	if err != nil {
		t.Fatalf("failed to create mock bin: %v", err)
	}

	magic := [8]byte{'S', 'R', 'V', 'R', 'B', 'I', 'N', 0}
	if _, err := outFile.Write(magic[:]); err != nil {
		t.Fatalf("failed to write magic: %v", err)
	}
	if err := binary.Write(outFile, binary.LittleEndian, int32(numStations)); err != nil {
		t.Fatalf("failed to write numStations: %v", err)
	}
	padding := [4]byte{0, 0, 0, 0}
	if _, err := outFile.Write(padding[:]); err != nil {
		t.Fatalf("failed to write padding: %v", err)
	}
	if err := binary.Write(outFile, binary.LittleEndian, baseFares); err != nil {
		t.Fatalf("failed to write baseFares: %v", err)
	}
	if err := binary.Write(outFile, binary.LittleEndian, baseFares); err != nil {
		t.Fatalf("failed to write icFares: %v", err)
	}

	flatSize := numStations * numStations
	flatBaseDistGisei := make([]uint16, flatSize)
	const INF = uint16(65535)
	for i := 0; i < numStations; i++ {
		for j := 0; j < numStations; j++ {
			idx := i*numStations + j
			if baseDistGisei[i] != nil && j < len(baseDistGisei[i]) {
				flatBaseDistGisei[idx] = uint16(baseDistGisei[i][j])
			} else {
				flatBaseDistGisei[idx] = INF
			}
		}
	}
	if err := binary.Write(outFile, binary.LittleEndian, flatBaseDistGisei); err != nil {
		t.Fatalf("failed to write flatBaseDistGisei: %v", err)
	}
	if err := binary.Write(outFile, binary.LittleEndian, flatBaseDistGisei); err != nil {
		t.Fatalf("failed to write flatIcDistGisei: %v", err)
	}

	if err := outFile.Sync(); err != nil {
		t.Fatalf("failed to sync file: %v", err)
	}
	if err := outFile.Close(); err != nil {
		t.Fatalf("failed to close file: %v", err)
	}
}

func setupSearch(t testing.TB) (*graph.RailwayGraph, *usecase.SearchOptimalSplit, *usecase.CalculateAmount) {
	t.Helper()

	binPath := "../../internal/graph/data/precomputed_server.bin"
	var useBinPath string
	var mockGraph *graph.RailwayGraph

	if _, err := os.Stat(binPath); os.IsNotExist(err) {
		isMockMode = true
		tmpDir := t.TempDir()
		useBinPath = filepath.Join(tmpDir, "precomputed_mock.bin")

		loader := &graphio.JSONLoader{}
		g, err := loader.Load(strings.NewReader(edgesMockJSON))
		if err != nil {
			t.Fatalf("モックグラフの読み込みに失敗: %v", err)
		}
		mockGraph = g

		generateMockPrecomputedBin(t, mockGraph, useBinPath)
	} else {
		useBinPath = binPath
	}

	var g *graph.RailwayGraph
	if isMockMode {
		g = mockGraph
	} else {
		loader := &graphio.JSONLoader{}
		var err error
		g, err = loader.Load(data.GetEdgesReader())
		if err != nil {
			t.Fatalf("グラフの読み込みに失敗: %v", err)
		}
	}

	calcs, err := fareio.InitRegistryWithOptions(g, isMockMode)
	if err != nil {
		t.Fatalf("運賃計算機の初期化に失敗: %v", err)
	}

	bypassReg := domain.NewBypassRegistry()
	if !isMockMode {
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
	}

	bypassRules, err := bypassReg.ResolveIDs(func(name string) (int, bool) {
		id, ok := g.GetID(name)
		return id, ok
	})
	if err != nil {
		t.Fatalf("特例ルールの解決に失敗: %v", err)
	}

	amount := usecase.NewCalculateAmount(
		g, calcs.Registry, domain.NewAddonRegistry(), domain.NewAddonRegistry(),
		calcs.TrainSpecific, calcs.SpecificRoute, calcs.AdjustedRoute,
	)
	opt := optimizer.NewDPOptimizer(amount)
	split := usecase.NewFindOptimalSplit(opt, amount)
	baseFares, _, baseDistGisei, _, numStations, err := data.LoadPrecomputedFares(useBinPath)
	if err != nil {
		t.Fatalf("事前計算された運賃データのロードに失敗しました: %v", err)
	}
	if int32(g.NumStations()) != numStations {
		t.Fatalf("データ不整合: edges.jsonの駅数(%d)が事前計算データの駅数(%d)と一致しません。事前計算ファイルを再生成してください", g.NumStations(), numStations)
	}
	g.DistGisei = baseDistGisei
	search := usecase.NewSearchOptimalSplit(g, split, bypassRules, 0, baseFares, numStations)

	t.Cleanup(func() {
		data.ClosePrecomputedFares()
	})

	return g, search, amount
}

func TestSearchOptimalSplit_Integration(t *testing.T) {
	g, search, _ := setupSearch(t)

	type testCase struct {
		name    string
		from    string
		to      string
		months  int
		want    int
		wantErr bool
	}

	var tests []testCase

	if isMockMode {
		tests = []testCase{
			{
				name:   "テスト大宮〜テスト東京 (通常経路の検証)",
				from:   "テスト大宮",
				to:     "テスト東京",
				months: 1,
				want:   15600,
			},
			{
				name:   "テスト大宮〜テスト赤羽 (途中駅までの検証)",
				from:   "テスト大宮",
				to:     "テスト赤羽",
				months: 1,
				want:   10480,
			},
			{
				name:    "テスト大宮〜テスト大宮 (同一駅、エラーケース)",
				from:    "テスト大宮",
				to:      "テスト大宮",
				months:  1,
				wantErr: true,
			},
		}
	} else {
		tests = []testCase{
			{
				name:   "大宮〜東京 (通常の分割検討)",
				from:   "大宮",
				to:     "東京",
				months: 1,
				want:   17970,
			},
			{
				name:   "日暮里〜赤羽 (通しが最安)",
				from:   "日暮里",
				to:     "赤羽",
				months: 1,
				want:   6240,
			},
			{
				name:   "横浜〜新宿 (長距離の分割検討)",
				from:   "横浜",
				to:     "新宿",
				months: 3,
				want:   52200,
			},
			{
				name:   "品川〜名古屋 (長距離の分割検討)",
				from:   "品川",
				to:     "名古屋",
				months: 3,
				want:   488790,
			},
			{
				name:   "函館〜東森 (第69条の考慮　片側のみ)",
				from:   "函館",
				to:     "東森",
				months: 6,
				want:   226080,
			},
			{
				name:   "新川崎〜大井町 (第69条の考慮　特例区間内完結)",
				from:   "新川崎",
				to:     "大井町",
				months: 3,
				want:   22340,
			},
			{
				name:    "東京〜東京 (同一駅、エラーケース)",
				from:    "東京",
				to:      "東京",
				months:  6,
				wantErr: true,
			},
		}
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fromID, ok1 := g.GetID(tt.from)
			toID, ok2 := g.GetID(tt.to)
			if !ok1 || !ok2 {
				t.Fatalf("駅が見つかりません: %s, %s", tt.from, tt.to)
			}

			results, err := search.Execute(fromID, toID, tt.months)
			if (err != nil) != tt.wantErr {
				t.Errorf("Execute() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if err == nil {
				if len(results) == 0 {
					t.Error("結果が空です")
					return
				}

				path := results[0]
				if len(results) > 1 {
					path = results[1]
				}

				totalFare := 0
				for i := 0; i < len(path)-1; i++ {
					segs, err := search.GetCheapestNoSplitSegments(path[i], path[i+1], tt.months)
					if err != nil {
						t.Fatalf("GetCheapestNoSplitSegments failed: %v", err)
					}
					totalFare += segs[0].Result.TotalAmount()
				}

				if totalFare != tt.want {
					t.Errorf("TotalAmount = %d, want %d", totalFare, tt.want)
				}
			}
		})
	}
}

func BenchmarkSearchOptimalSplit_Integration(b *testing.B) {
	g, search, _ := setupSearch(b)

	fromID, ok1 := g.GetID("品川")
	toID, ok2 := g.GetID("名古屋")
	if !ok1 || !ok2 {
		b.Fatalf("駅が見つかりません: 品川, 名古屋")
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, err := search.Execute(fromID, toID, 3)
		if err != nil {
			b.Fatalf("Execute が失敗しました: %v", err)
		}
	}
}

func BenchmarkSearchOptimalSplit_PureDP(b *testing.B) {
	g, search, calc := setupSearch(b)

	fromID, ok1 := g.GetID("横浜")
	toID, ok2 := g.GetID("新宿")
	if !ok1 || !ok2 {
		b.Fatalf("駅が見つかりません: 横浜, 新宿")
	}

	shortest, err := g.FindShortestPathGisei(fromID, toID)
	if err != nil {
		b.Fatalf("最短経路の検索に失敗: %v", err)
	}

	calcResult, err := calc.Execute(shortest.StationIDs, 3)
	if err != nil {
		b.Fatalf("運賃計算に失敗: %v", err)
	}
	normalAmount := calcResult.TotalAmount()

	var cheapestAmountPerDecikilo float64
	kyotoID, kyotoExists := g.GetID("京都")
	osakaID, osakaExists := g.GetID("大阪")
	if kyotoExists && osakaExists {
		kyotoToOsakaPath, err := g.FindShortestPathGisei(kyotoID, osakaID)
		if err != nil {
			b.Fatalf("京都->大阪の最短経路検索に失敗: %v", err)
		}
		kyotoToOsakaAmount, err := calc.Execute(kyotoToOsakaPath.StationIDs, 3)
		if err != nil {
			b.Fatalf("京都->大阪の運賃計算に失敗: %v", err)
		}
		cheapestAmountPerDecikilo = float64(kyotoToOsakaAmount.TotalAmount()) / float64(kyotoToOsakaPath.EigyoKilo)
	} else {
		cheapestAmountPerDecikilo = 130540.0 / 100.0
	}

	maxGisei := int(float64(normalAmount) / cheapestAmountPerDecikilo)
	if maxGisei < int(shortest.GiseiKilo) {
		maxGisei = int(shortest.GiseiKilo)
	}

	numStations := g.NumStations()
	scratch := usecase.GetDPScratchForTest()
	usecase.EnsureSizeForTest(scratch, numStations, 0, numStations) // maxSections=0 (磁気定期)

	candFlags := usecase.GetCandFlagsForTest(scratch)
	for i := 0; i < numStations; i++ {
		candFlags[i] = false
	}
	candFlags[fromID] = true
	candFlags[toID] = true

	const unreachable = 65535
	startOffset := fromID * numStations
	endOffset := toID * numStations

	for id := 0; id < numStations; id++ {
		dStart := int(g.DistGisei[startOffset+id])
		dEnd := int(g.DistGisei[endOffset+id])
		if dStart == unreachable || dEnd == unreachable {
			continue
		}
		if dStart+dEnd <= maxGisei {
			candFlags[id] = true
		}
	}

	candStationsBuf := usecase.GetCandStationsBufForTest(scratch)
	candLen := 0
	for id := 0; id < numStations; id++ {
		if candFlags[id] {
			candStationsBuf[candLen] = id
			candLen++
		}
	}
	candStations := candStationsBuf[:candLen]

	b.Logf("Candidate stations count: %d", len(candStations))

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		err := search.RunBenchmarkDPForTest(fromID, toID, 3, 0, candStations, scratch)
		if err != nil {
			b.Fatalf("DP失敗: %v", err)
		}
	}
	b.StopTimer()
	usecase.PutDPScratchForTest(scratch)
}
