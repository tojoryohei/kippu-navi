package graph_test

import (
	"os"
	"testing"

	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
)

func TestFindShortestPathGisei(t *testing.T) {
	g := graph.NewGraph(10)

	// テストデータの構築
	// A --(10km)--> B --(20km)--> C
	// A --(40km)----------------> C
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("A"), ToID: g.GetOrAddID("B"), GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("B"), ToID: g.GetOrAddID("C"), GiseiKilo: 200, EigyoKilo: 200})
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("A"), ToID: g.GetOrAddID("C"), GiseiKilo: 400, EigyoKilo: 400})

	// ダイクストラのテスト
	res, err := g.FindShortestPathGisei("A", "C")
	if err != nil {
		t.Fatalf("経路探索に失敗しました: %v", err)
	}

	if res.GiseiKilo != 300 {
		t.Errorf("最短距離が不正です: got %v, want 300", res.GiseiKilo)
	}

	expectedPath := []string{"A", "B", "C"}
	if len(res.Stations) != len(expectedPath) {
		t.Fatalf("経路の長さが不正です: got %d, want %d", len(res.Stations), len(expectedPath))
	}
	for i, s := range res.Stations {
		if s != expectedPath[i] {
			t.Errorf("経路が不正です [%d]: got %s, want %s", i, s, expectedPath[i])
		}
	}
}

func TestSaveAndLoadBinary(t *testing.T) {
	g := graph.NewGraph(10)
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("A"), ToID: g.GetOrAddID("B"), GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("B"), ToID: g.GetOrAddID("C"), GiseiKilo: 200, EigyoKilo: 200})
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("A"), ToID: g.GetOrAddID("C"), GiseiKilo: 400, EigyoKilo: 400})

	// シリアライズのテスト
	tmpFile := "test_graph.gob"
	defer os.Remove(tmpFile)

	if err := g.SaveBinary(tmpFile); err != nil {
		t.Fatalf("バイナリ保存に失敗しました: %v", err)
	}

	g2, err := graph.LoadGraphBinary(tmpFile)
	if err != nil {
		t.Fatalf("バイナリ読み込みに失敗しました: %v", err)
	}

	// 読み込んだグラフで再度テスト
	res2, err := g2.FindShortestPathGisei("A", "C")
	if err != nil {
		t.Fatalf("読み込み後の経路探索に失敗しました: %v", err)
	}

	if res2.GiseiKilo != 300 {
		t.Errorf("読み込み後の最短距離が不正です: got %v, want 300", res2.GiseiKilo)
	}
}

func TestFindAllCandidatePaths(t *testing.T) {
	g := graph.NewGraph(10)

	// テストデータの構築
	// A --(10km)--> B --(20km)--> C
	// A --(40km)----------------> C
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("A"), ToID: g.GetOrAddID("B"), GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("B"), ToID: g.GetOrAddID("C"), GiseiKilo: 200, EigyoKilo: 200})
	g.AddEdge(domain.Edge{FromID: g.GetOrAddID("A"), ToID: g.GetOrAddID("C"), GiseiKilo: 400, EigyoKilo: 400})

	// 候補経路探索のテスト (maxGisei = 400)
	// A-B-C (300) と A-C (400) が見つかるはず
	allPaths, err := g.FindAllCandidatePaths("A", "C", 400)
	if err != nil {
		t.Fatalf("候補経路探索に失敗しました: %v", err)
	}

	if len(allPaths) != 2 {
		t.Errorf("候補経路の数が不正です: got %d, want 2", len(allPaths))
	}
}
