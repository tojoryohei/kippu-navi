package pass_test

import (
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"calculation-engine/internal/pass/graph/data"
	"calculation-engine/internal/pass/infra/fareio"
	"calculation-engine/internal/pass/infra/graphio"
	"calculation-engine/internal/pass/optimizer"
	"calculation-engine/internal/pass/usecase"
	"testing"
)

func TestSearchOptimalSplit_Integration(t *testing.T) {
	calc, base := setup(t)
	g := base.(*graph.RailwayGraph)
	rules, err := passdomain.NewDefaultBypassRegistry().ResolveIDs(g.GetID)
	if err != nil {
		t.Fatal(err)
	}
	search := usecase.NewOnDemandSearch(g, usecase.NewFindOptimalSplit(optimizer.NewDPOptimizer(calc), calc), rules, 0)

	type testCase struct {
		name    string
		from    string
		to      string
		months  int
		want    int
		wantErr bool
	}

	tests := []testCase{
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
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fromID, ok1 := g.GetID(tt.from)
			toID, ok2 := g.GetID(tt.to)
			if !ok1 || !ok2 {
				t.Fatalf("駅が見つかりません: %s, %s", tt.from, tt.to)
			}

			results, err := search.Execute(fromID, toID, tt.months)
			if (err != nil) != tt.wantErr {
				t.Errorf("Execute() エラー = %v, エラー発生の期待値 %v", err, tt.wantErr)
				return
			}

			if err == nil {
				if len(results) == 0 {
					t.Error("結果が空です")
					return
				}

				path := results[0]

				totalFare := 0
				for i := 0; i < len(path)-1; i++ {
					segs, err := search.GetCheapestNoSplitSegments(path[i], path[i+1], tt.months)
					if err != nil {
						t.Fatalf("GetCheapestNoSplitSegmentsに失敗しました: %v", err)
					}
					totalFare += segs[0].Result.TotalAmount()
				}

				if totalFare != tt.want {
					t.Errorf("TotalAmount = %d, 期待値 %d", totalFare, tt.want)
				}
			}
		})
	}
}

func setupPrecomputedSearch(t testing.TB) (*graph.RailwayGraph, *usecase.SearchOptimalSplit, *usecase.CalculateAmount) {
	t.Helper()
	g, err := (&graphio.JSONLoader{}).Load(data.GetEdgesReader())
	if err != nil {
		t.Fatal(err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("運賃計算機の初期化に失敗: %v", err)
	}

	bypassReg := passdomain.NewDefaultBypassRegistry()

	bypassRules, err := bypassReg.ResolveIDs(func(name string) (int, bool) {
		id, ok := g.GetID(name)
		return id, ok
	})
	if err != nil {
		t.Fatalf("特例ルールの解決に失敗: %v", err)
	}

	amount := usecase.NewCalculateAmount(
		g, calcs.Registry, passdomain.NewAddonRegistry(), passdomain.NewAddonRegistry(),
		calcs.TrainSpecific, calcs.SpecificRoute, calcs.AdjustedRoute, nil,
	)
	opt := optimizer.NewDPOptimizer(amount)
	split := usecase.NewFindOptimalSplit(opt, amount)
	baseFares, _, baseDistGisei, _, numStations, err := data.LoadPrecomputedFares("../../../data/precomputed/pass.bin")
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

func BenchmarkSearchOptimalSplit_Integration(b *testing.B) {
	g, search, _ := setupPrecomputedSearch(b)

	fromID, ok1 := g.GetID("品川")
	toID, ok2 := g.GetID("名古屋")
	if !ok1 || !ok2 {
		b.Fatalf("駅が見つかりません: 品川, 名古屋")
	}

	b.ResetTimer()
	for b.Loop() {
		_, err := search.Execute(fromID, toID, 3)
		if err != nil {
			b.Fatalf("Execute が失敗しました: %v", err)
		}
	}
}

func BenchmarkSearchOptimalSplit_PureDP(b *testing.B) {
	g, search, calc := setupPrecomputedSearch(b)

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
	usecase.EnsureCandidateBuffersForTest(scratch, numStations)

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

	b.Logf("候補駅数: %d", len(candStations))

	b.ResetTimer()
	for b.Loop() {
		err := search.RunBenchmarkDPForTest(fromID, toID, 3, 0, candStations, scratch)
		if err != nil {
			b.Fatalf("DP失敗: %v", err)
		}
	}
	b.StopTimer()
	usecase.PutDPScratchForTest(scratch)
}
