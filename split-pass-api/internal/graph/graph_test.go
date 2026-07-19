package graph_test

import (
	"testing"

	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
)

func TestFindShortestPathGisei(t *testing.T) {
	g := graph.NewGraph(10)

	startID := g.GetOrAddID("A")
	midID := g.GetOrAddID("B")
	endID := g.GetOrAddID("C")

	// テストデータの構築
	// A --(10.0km)--> B --(20.0km)--> C
	// A --(40.0km)----------------> C
	g.AddEdge(domain.Edge{FromID: startID, ToID: midID, GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: midID, ToID: endID, GiseiKilo: 200, EigyoKilo: 200})
	g.AddEdge(domain.Edge{FromID: startID, ToID: endID, GiseiKilo: 400, EigyoKilo: 400})

	res, err := g.FindShortestPathGisei(startID, endID)
	if err != nil {
		t.Fatalf("経路探索に失敗しました: %v", err)
	}

	if res.GiseiKilo != 300 {
		t.Errorf("最短距離が不正です: got %v, want 300", res.GiseiKilo)
	}

	expectedPath := []int{startID, midID, endID}
	if len(res.StationIDs) != len(expectedPath) {
		t.Fatalf("経路の長さが不正です: got %d, want %d", len(res.StationIDs), len(expectedPath))
	}
	for i, id := range res.StationIDs {
		if id != expectedPath[i] {
			t.Errorf("経路が不正です [%d]: got %v, want %v", i, id, expectedPath[i])
		}
	}
}

func TestFindKShortestPathsGisei(t *testing.T) {
	g := graph.NewGraph(10)

	startID := g.GetOrAddID("A")
	bID := g.GetOrAddID("B")
	cID := g.GetOrAddID("C")
	endID := g.GetOrAddID("D")

	// テスト用グラフ (双方向エッジ):
	// A <--(10)--> B <--(20)--> D
	// A <--(15)--> C <--(10)--> D
	// A <--(45)--------------> D
	g.AddEdge(domain.Edge{FromID: startID, ToID: bID, GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: bID, ToID: startID, GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: bID, ToID: endID, GiseiKilo: 200, EigyoKilo: 200})
	g.AddEdge(domain.Edge{FromID: endID, ToID: bID, GiseiKilo: 200, EigyoKilo: 200})
	g.AddEdge(domain.Edge{FromID: startID, ToID: cID, GiseiKilo: 150, EigyoKilo: 150})
	g.AddEdge(domain.Edge{FromID: cID, ToID: startID, GiseiKilo: 150, EigyoKilo: 150})
	g.AddEdge(domain.Edge{FromID: cID, ToID: endID, GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: endID, ToID: cID, GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: startID, ToID: endID, GiseiKilo: 450, EigyoKilo: 450})
	g.AddEdge(domain.Edge{FromID: endID, ToID: startID, GiseiKilo: 450, EigyoKilo: 450})

	// ケース 1: maxGisei を 350 に制限 (A-C-D (250) と A-B-D (300) を検出するはず)
	res, err := g.FindKShortestPathsGisei(startID, endID, 10, 350)
	if err != nil {
		t.Fatalf("FindKShortestPathsGisei に失敗しました: %v", err)
	}

	if len(res) != 2 {
		t.Fatalf("期待される経路数は 2 ですが、%d でした", len(res))
	}

	if res[0].GiseiKilo != 250 || res[1].GiseiKilo != 300 {
		t.Errorf("経路コストが不正です: got %d と %d, want 250 と 300", res[0].GiseiKilo, res[1].GiseiKilo)
	}

	// ケース 2: K を 1、maxGisei を 500 に設定 (最短経路 A-C-D のみ検出するはず)
	res2, err := g.FindKShortestPathsGisei(startID, endID, 1, 500)
	if err != nil {
		t.Fatalf("FindKShortestPathsGisei に失敗しました: %v", err)
	}
	if len(res2) != 1 {
		t.Fatalf("期待される経路数は 1 ですが、%d でした", len(res2))
	}
	if res2[0].GiseiKilo != 250 {
		t.Errorf("経路コストが不正です: got %d, want 250", res2[0].GiseiKilo)
	}

	// ケース 3: maxGisei を 500、K を 10 に設定 (全 3 経路を検出するはず)
	res3, err := g.FindKShortestPathsGisei(startID, endID, 10, 500)
	if err != nil {
		t.Fatalf("FindKShortestPathsGisei に失敗しました: %v", err)
	}
	if len(res3) != 3 {
		t.Fatalf("期待される経路数は 3 ですが、%d でした", len(res3))
	}
	if res3[0].GiseiKilo != 250 || res3[1].GiseiKilo != 300 || res3[2].GiseiKilo != 450 {
		t.Errorf("経路コストが不正です: got %d, %d, %d; want 250, 300, 450", res3[0].GiseiKilo, res3[1].GiseiKilo, res3[2].GiseiKilo)
	}
}
