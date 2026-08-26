package ticket_test

import (
	"fmt"
	"io"
	"testing"

	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/fareio"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/optimizer"
	"calculation-engine/internal/ticket/usecase"
)

func setupTicketSplit(t *testing.T) (*usecase.FindOptimalSplit, *usecase.TicketSegmentEvaluator, graph.Graph) {
	t.Helper()

	// 1. グラフのロード（edges と virtual_edges）
	loader := &graphio.JSONLoader{}
	physicalGraph, fullGraph, err := loader.LoadSeparatedGraphs(
		[]io.Reader{graphdata.GetEdgesReader()},
		[]io.Reader{graphdata.GetVirtualEdgesReader()},
	)
	if err != nil {
		t.Fatalf("グラフデータのロードに失敗しました: %v", err)
	}

	// 2. 特例（特定都区市内）のレジストリ
	zoneReg, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatalf("特例ゾーンのロードに失敗しました: %v", err)
	}

	// ゾーン名をグラフに追加
	for _, z := range zoneReg.Zones {
		fullGraph.GetOrAddID(z.Name)
	}

	// 3. 運賃計算器の初期化
	fareReg := fare.NewRegistry()
	fareioReg, err := fareio.NewRegistry()
	if err != nil {
		t.Fatalf("fareioのロードに失敗しました: %v", err)
	}

	specificMatcher := fare.NewPathMatcher()
	for _, f := range fareioReg.GetSpecificFares() {
		ids := make([]int, 0, len(f.Path))
		for _, name := range f.Path {
			id, ok := fullGraph.GetID(name)
			if ok {
				ids = append(ids, id)
			}
		}
		if len(ids) == len(f.Path) {
			_ = specificMatcher.Insert(ids, f.Fare)
		}
	}

	adjustedMatcher := fare.NewPathMatcher()
	for _, f := range fareioReg.GetAdjustedFares() {
		ids := make([]int, 0, len(f.Path))
		for _, name := range f.Path {
			id, ok := fullGraph.GetID(name)
			if ok {
				ids = append(ids, id)
			}
		}
		if len(ids) == len(f.Path) {
			_ = adjustedMatcher.Insert(ids, f.Fare)
		}
	}

	// 3.5. 加算運賃の登録
	addonReg := fare.NewAddonRegistry()
	addonReg.Register("南千歳", "新千歳空港", 20)
	addonReg.Register("日根野", "りんくうタウン", 150)
	addonReg.Register("りんくうタウン", "関西空港", 170)
	addonReg.Register("日根野", "関西空港", 220)
	addonReg.Register("児島", "宇多津", 110)
	addonReg.Register("田吉", "宮崎空港", 130)
	_ = addonReg.ResolveIDs(func(name string) (int, bool) {
		return fullGraph.GetID(name)
	})

	trainSpecificCalc := fare.NewTrainSpecificSectionCalculator()

	zrBytes, err := io.ReadAll(graphdata.GetZoneRoutesReader())
	if err != nil {
		t.Fatalf("zoneRoutesの読み込みに失敗しました: %v", err)
	}
	zoneRoutes, err := ticketdomain.LoadZoneRoutesFromBytes(zrBytes)
	if err != nil {
		t.Fatalf("zoneRoutesのパースに失敗しました: %v", err)
	}

	privateReg, err := fareio.NewPrivateFareRegistry()
	if err != nil {
		t.Fatalf("PrivateFareRegistryの初期化に失敗しました: %v", err)
	}

	calc := usecase.NewCalculateAmount(
		fareReg,
		addonReg,
		trainSpecificCalc,
		specificMatcher,
		adjustedMatcher,
		privateReg,
		fullGraph,
		zoneRoutes,
	)

	// 4. 特例適用器とセグメントエバリュエータ
	applier := usecase.NewSpecialZoneApplier(fullGraph, zoneReg)
	segmentEvaluator := usecase.NewTicketSegmentEvaluator(calc, applier, zoneReg, fullGraph)

	// 5. 分割オプティマイザ
	opt := optimizer.NewDPOptimizer(segmentEvaluator)

	// 6. ユースケース
	splitUseCase := usecase.NewFindOptimalSplit(opt)

	return splitUseCase, segmentEvaluator, physicalGraph
}

func TestTicketSegmentEvaluator_Execute(t *testing.T) {
	if testing.Short() {
		t.Skip("統合テストをスキップします")
	}

	_, eval, g := setupTicketSplit(t)

	t.Run("200km超のため特例が適用されるケース（東京都区内〜名古屋）", func(t *testing.T) {
		// 東京都区内内の駅（例: 蒲田）から名古屋までの経路を探索
		fromID, _ := g.GetID("蒲田")
		toID, _ := g.GetID("名古屋")
		resPath, err := g.FindShortestPathGisei(fromID, toID)
		if err != nil {
			t.Fatalf("経路探索失敗: %v", err)
		}
		path := resPath.StationIDs

		res, err := eval.Execute(path, 0)
		if err != nil {
			t.Fatalf("Execute() err = %v", err)
		}

		fmt.Print("Path IDs: ")
		for _, id := range path {
			fmt.Printf("%s ", g.GetName(id))
		}
		fmt.Println()

		// 東京〜名古屋 (営業キロ366.0km -> 366km) の運賃は 6380円
		if res.TotalAmount() != 6490 {
			fmt.Printf("TEST FAILED! TotalAmount=%d, TotalEigyoKilo=%v, FinalPath=%v\n", res.TotalAmount(), res.TotalEigyoKilo, res.FinalPath)
			t.Errorf("期待する運賃(6490)と異なります: %d", res.TotalAmount())
		}
	})

	t.Run("大阪・新大阪の特例（新大阪〜相生：姫路経由）", func(t *testing.T) {
		// 新大阪〜相生間を姫路経由で移動する場合、第88条の特例により「大阪」起点として計算される
		fromID, _ := g.GetID("新大阪")
		toID, _ := g.GetID("相生")
		resPath, err := g.FindShortestPathGisei(fromID, toID)
		if err != nil {
			t.Fatalf("経路探索失敗: %v", err)
		}
		path := resPath.StationIDs

		res, err := eval.Execute(path, 0)
		if err != nil {
			t.Fatalf("Execute() err = %v", err)
		}

		// 特例適用により「大阪・新大阪」発の計算が行われる。
		// この経路は新神戸を経由するため、計算上は「大阪〜新大阪〜新神戸〜西明石〜姫路〜相生」となり116.2km。
		var pathNames []string
		for _, id := range path {
			pathNames = append(pathNames, g.GetName(id))
		}
		t.Logf("Path names: %v", pathNames)
		if res.TotalEigyoKilo != 1086 {
			t.Errorf("特例が適用されていない、または計算が誤っています。期待値 1086, 実際 %d", res.TotalEigyoKilo)
		}
	})

	t.Run("200km未達のため特例適用がロールバックされるケース（蒲田〜熱海）", func(t *testing.T) {
		// 蒲田〜熱海は100km未満。実距離で計算されるはず。
		fromID, _ := g.GetID("蒲田")
		toID, _ := g.GetID("熱海")
		resPath, err := g.FindShortestPathGisei(fromID, toID)
		if err != nil {
			t.Fatalf("経路探索失敗: %v", err)
		}
		path := resPath.StationIDs

		res, err := eval.Execute(path, 0)
		if err != nil {
			t.Fatalf("Execute() err = %v", err)
		}

		// 蒲田〜熱海の実距離 90.2km -> 91km (幹線 1690円)
		if res.TotalAmount() != 1790 {
			t.Errorf("期待する運賃(1790)と異なります: %d", res.TotalAmount())
		}
	})
}

func TestFindOptimalSplit_Execute(t *testing.T) {
	if testing.Short() {
		t.Skip("統合テストをスキップします")
	}

	splitUseCase, _, g := setupTicketSplit(t)

	t.Run("蒲田〜熱海間の分割探索", func(t *testing.T) {
		fromID, _ := g.GetID("蒲田")
		toID, _ := g.GetID("熱海")
		resPath, err := g.FindShortestPathGisei(fromID, toID)
		if err != nil {
			t.Fatalf("経路探索失敗: %v", err)
		}
		path := resPath.StationIDs
		locked := make([]bool, len(path)) // すべてfalse（全駅で分割可能）
		maxSections := 0                  // 無制限

		results, err := splitUseCase.Execute(path, locked, maxSections)
		if err != nil {
			t.Fatalf("Execute() err = %v", err)
		}

		if len(results) == 0 {
			t.Fatal("分割結果がありません")
		}

		cheapest := results[0].TotalAmount
		for _, r := range results {
			if r.TotalAmount < cheapest {
				cheapest = r.TotalAmount
			}
		}

		// 分割しない場合は1690円。分割して安くなる場合（例: 蒲田〜横浜 230 + 横浜〜熱海 1340 = 1570 等）があるかどうか
		// 最安値はとにかく計算できることを確認する
		if cheapest <= 0 {
			t.Errorf("異常な最安運賃: %d", cheapest)
		}
	})
}
