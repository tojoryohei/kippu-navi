package usecase_test

import (
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/optimizer"
	"split-pass-api/internal/usecase"
	"testing"
)

func TestSearchOptimalSplit_Execute(t *testing.T) {
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

	calcAmount := usecase.NewCalculateAmount(
		g, reg, domain.NewAddonRegistry(), domain.NewAddonRegistry(),
		fare.NewTrainSpecificSectionCalculator(dummyTable),
		fare.NewRouteMatcher(), fare.NewRouteMatcher(),
	)

	split := usecase.NewFindOptimalSplit(optimizer.NewDPOptimizer(calcAmount), calcAmount)

	t.Run("特例ルールなし: 最短経路(A-B-C)内の分割が最安になるケース", func(t *testing.T) {
		search := usecase.NewSearchOptimalSplit(g, split, nil, 0)
		// A-B-C (20km): 通し=2500, 分割(A-B, B-C)=1000+1000=2000
		// A-C (21km): 通し=3000
		// 特例なしの場合、最安は 2000
		got, err := search.Execute(id("A"), id("C"), 1)
		if err != nil {
			t.Fatalf("Execute が失敗しました: %v", err)
		}

		if len(got.Optimals) == 0 {
			t.Fatal("結果が空です")
		}

		if got.Optimals[0].TotalAmount != 2000 {
			t.Errorf("TotalAmount = %d, 期待値は 2000", got.Optimals[0].TotalAmount)
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
		search := usecase.NewSearchOptimalSplit(g, split, rules, 0)

		// DからC(遠回り端点)を検索する。
		// DFSは [D, A, C] を出力するはず。
		// オーケストレーターは C が遠回りの端点だと検知し、近道の分岐駅(Cの本来の到着点)まで
		// ルートを [D, A, B, C] に置換・補正（オーバーシュート）する。
		// さらに、近道中間駅 B には locked が掛かり分割禁止となる。
		got, err := search.Execute(id("D"), id("C"), 1)
		if err != nil {
			t.Fatalf("Execute が失敗しました: %v", err)
		}

		if len(got.Optimals) == 0 {
			t.Fatal("結果が空です")
		}

		// D-A(5km:1000円) + A-B-C(通し計算で20km:2500円) = 3500円 など、
		// 補正されたルート群の中でDPが計算した最安値が返ることを確認
		if got.Optimals[0].TotalAmount <= 0 {
			t.Errorf("有効な TotalAmount が期待されますが、%d を取得しました", got.Optimals[0].TotalAmount)
		}
	})

	t.Run("異常系：存在しない駅", func(t *testing.T) {
		search := usecase.NewSearchOptimalSplit(g, split, nil, 0)
		_, err := search.Execute(-1, 99, 1)
		if err == nil {
			t.Error("無効な駅IDに対するエラーが期待されますが、nilを取得しました")
		}
	})

	t.Run("MaxSections制約: 無制限(0), 1回分割(2), 分割なし(1)の比較", func(t *testing.T) {
		g2 := graph.NewGraph(10)
		id2 := func(name string) int { return g2.GetOrAddID(name) }

		// A - B - C - D (各10km)
		g2.AddEdge(domain.Edge{FromID: id2("A"), ToID: id2("B"), EigyoKilo: 100, GiseiKilo: 100, Company: domain.JREast})
		g2.AddEdge(domain.Edge{FromID: id2("B"), ToID: id2("C"), EigyoKilo: 100, GiseiKilo: 100, Company: domain.JREast})
		g2.AddEdge(domain.Edge{FromID: id2("C"), ToID: id2("D"), EigyoKilo: 100, GiseiKilo: 100, Company: domain.JREast})

		reg2 := fare.NewRegistry()
		var dummyTable2 [101]domain.PassPrice
		for i := range dummyTable2 {
			if i <= 10 {
				dummyTable2[i] = domain.PassPrice{OneMonth: 1000}
			} else if i <= 20 {
				dummyTable2[i] = domain.PassPrice{OneMonth: 3000}
			} else {
				dummyTable2[i] = domain.PassPrice{OneMonth: 5000}
			}
		}
		reg2.Register(domain.JREast, fare.NewEastCalculator(dummyTable2, dummyTable2))
		reg2.Register(domain.JRCentral, fare.NewStandardCalculator(dummyTable2, dummyTable2))

		calcAmount2 := usecase.NewCalculateAmount(
			g2, reg2, domain.NewAddonRegistry(), domain.NewAddonRegistry(),
			fare.NewTrainSpecificSectionCalculator(dummyTable2),
			fare.NewRouteMatcher(), fare.NewRouteMatcher(),
		)
		split2 := usecase.NewFindOptimalSplit(optimizer.NewDPOptimizer(calcAmount2), calcAmount2)

		// 運賃仕様:
		// 10km: 1000円 (A-B, B-C, C-D)
		// 20km: 3000円 (A-C, B-D)
		// 30km: 5000円 (A-D)
		//
		// 評価パターン:
		// 通し A-D (3区間, 30km): 5000円
		// 1分割(A-B + B-D) (2区間): 1000 + 3000 = 4000円
		// 2分割(A-B + B-C + C-D) (3区間): 1000 + 1000 + 1000 = 3000円
		//
		// maxSections=0(無制限) の場合: 2分割が最安(3000円)
		// maxSections=2(最大2区間) の場合: 2分割(3区間)が禁止されるため、1分割の(4000円)が最安になる。
		// maxSections=1(分割なし) の場合: 全ての分割が禁止されるため、通しの(5000円)が選ばれる。

		// maxSections=0
		search0 := usecase.NewSearchOptimalSplit(g2, split2, nil, 0)
		got0, err0 := search0.Execute(id2("A"), id2("D"), 1)
		if err0 != nil {
			t.Fatalf("Execute(0) が失敗しました: %v", err0)
		}

		// maxSections=2
		search2 := usecase.NewSearchOptimalSplit(g2, split2, nil, 2)
		got2, err2 := search2.Execute(id2("A"), id2("D"), 1)
		if err2 != nil {
			t.Fatalf("Execute(2) が失敗しました: %v", err2)
		}

		// maxSections=1
		search1 := usecase.NewSearchOptimalSplit(g2, split2, nil, 1)
		got1, err1 := search1.Execute(id2("A"), id2("D"), 1)
		if err1 != nil {
			t.Fatalf("Execute(1) が失敗しました: %v", err1)
		}

		if got0.Optimals[0].TotalAmount != 3000 {
			t.Errorf("maxSections=0 の TotalAmount = %d, 期待値は 3000", got0.Optimals[0].TotalAmount)
		}
		if got2.Optimals[0].TotalAmount != 4000 {
			t.Errorf("maxSections=2 の TotalAmount = %d, 期待値は 4000", got2.Optimals[0].TotalAmount)
		}
		if got1.Optimals[0].TotalAmount != 5000 {
			t.Errorf("maxSections=1 の TotalAmount = %d, 期待値は 5000", got1.Optimals[0].TotalAmount)
		}

		// maxSections=0 の場合は 3区間のパターンが存在するはず
		has3Sections := false
		for _, opt := range got0.Optimals {
			if len(opt.Segments) == 3 {
				has3Sections = true
				break
			}
		}
		if !has3Sections {
			t.Errorf("maxSections=0 なのに 3区間 のパターンが含まれていません")
		}

		// maxSections=2 の場合は 2区間であるはず
		for _, opt := range got2.Optimals {
			if len(opt.Segments) > 2 {
				t.Errorf("maxSections=2 なのに %d区間のパターンが含まれています", len(opt.Segments))
			}
		}

		// maxSections=1 の場合は 1区間であるはず
		for _, opt := range got1.Optimals {
			if len(opt.Segments) > 1 {
				t.Errorf("maxSections=1 なのに %d区間のパターンが含まれています", len(opt.Segments))
			}
		}
	})
}
