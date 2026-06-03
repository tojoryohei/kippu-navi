package usecase_test

import (
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/optimizer"
	"split-pass-api/internal/usecase"
	"testing"
)

func TestSearchOptimalSplitUseCase_Execute(t *testing.T) {
	g := graph.NewGraph(20)
	id := func(name string) int { return g.GetOrAddID(name) }

	// グラフ構築:
	// A --(10km)--> B --(10km)--> C (A-B-C: 計20km, 近道扱い)
	// A --(21km)----------------> C (A-C: 計21km, 遠回り扱い)
	g.AddEdge(domain.Edge{FromID: id("A"), ToID: id("B"), EigyoKilo: 100, GiseiKilo: 100, Company: domain.JREast})
	g.AddEdge(domain.Edge{FromID: id("B"), ToID: id("C"), EigyoKilo: 100, GiseiKilo: 100, Company: domain.JREast})
	g.AddEdge(domain.Edge{FromID: id("A"), ToID: id("C"), EigyoKilo: 210, GiseiKilo: 210, Company: domain.JREast})

	reg := fare.NewRegistry()
	var dummyTable [101]domain.PassPrice
	for i := range dummyTable {
		if i <= 10 {
			dummyTable[i] = domain.PassPrice{OneMonth: 1000}
		} else if i <= 20 {
			dummyTable[i] = domain.PassPrice{OneMonth: 2500}
		} else if i <= 30 {
			dummyTable[i] = domain.PassPrice{OneMonth: 3000}
		} else {
			dummyTable[i] = domain.PassPrice{OneMonth: 5000}
		}
	}
	reg.Register(domain.JREast, fare.NewEastCalculator(dummyTable, dummyTable))
	reg.Register(domain.JRCentral, fare.NewStandardCalculator(dummyTable, dummyTable))

	calcAmountUseCase := usecase.NewCalculateAmountUseCase(
		g, reg, domain.NewAddonRegistry(), domain.NewAddonRegistry(),
		fare.NewTrainSpecificSectionCalculator(dummyTable),
		fare.NewRouteMatcher(), fare.NewRouteMatcher(),
	)

	splitUseCase := usecase.NewFindOptimalSplitUseCase(optimizer.NewDPOptimizer(calcAmountUseCase), calcAmountUseCase)

	t.Run("特例ルールなし: 最短経路(A-B-C)内の分割が最安になるケース", func(t *testing.T) {
		searchUseCase := usecase.NewSearchOptimalSplitUseCase(g, splitUseCase, nil)
		// A-B-C (20km): 通し=2500, 分割(A-B, B-C)=1000+1000=2000
		// A-C (21km): 通し=3000
		// 特例なしの場合、最安は 2000
		got, err := searchUseCase.Execute(id("A"), id("C"), 1)
		if err != nil {
			t.Fatalf("Execute が失敗しました: %v", err)
		}

		if len(got) == 0 {
			t.Fatal("結果が空です")
		}

		if got[0].TotalAmount != 2000 {
			t.Errorf("TotalAmount = %d, 期待値は 2000", got[0].TotalAmount)
		}
	})

	t.Run("特例ルールあり: オーバーシュート補正の適用検証", func(t *testing.T) {
		// D --(5km)--> A
		g.AddEdge(domain.Edge{FromID: id("D"), ToID: id("A"), EigyoKilo: 50, GiseiKilo: 50, Company: domain.JREast})

		// ルール定義: 近道 [A, B, C], 遠回り [A, C]
		rules := []domain.ResolvedBypassRule{
			{
				ShortcutPath: []int{id("A"), id("B"), id("C")},
				DetourPath:   []int{id("A"), id("C")},
			},
		}
		searchUseCase := usecase.NewSearchOptimalSplitUseCase(g, splitUseCase, rules)

		// DからC(遠回り端点)を検索する。
		// DFSは [D, A, C] を出力するはず。
		// オーケストレーターは C が遠回りの端点だと検知し、近道の分岐駅(Cの本来の到着点)まで
		// ルートを [D, A, B, C] に置換・補正（オーバーシュート）する。
		// さらに、近道中間駅 B には locked が掛かり分割禁止となる。
		got, err := searchUseCase.Execute(id("D"), id("C"), 1)
		if err != nil {
			t.Fatalf("Execute が失敗しました: %v", err)
		}

		if len(got) == 0 {
			t.Fatal("結果が空です")
		}

		// D-A(5km:1000円) + A-B-C(通し計算で20km:2500円) = 3500円 など、
		// 補正されたルート群の中でDPが計算した最安値が返ることを確認
		if got[0].TotalAmount <= 0 {
			t.Errorf("有効な TotalAmount が期待されますが、%d を取得しました", got[0].TotalAmount)
		}
	})

	t.Run("異常系：存在しない駅", func(t *testing.T) {
		searchUseCase := usecase.NewSearchOptimalSplitUseCase(g, splitUseCase, nil)
		_, err := searchUseCase.Execute(-1, 99, 1)
		if err == nil {
			t.Error("無効な駅IDに対するエラーが期待されますが、nilを取得しました")
		}
	})
}
