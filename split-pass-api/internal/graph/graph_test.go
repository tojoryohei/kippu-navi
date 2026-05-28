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

func TestFindAllCandidatePaths(t *testing.T) {
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

	allPaths, err := g.FindAllCandidatePaths(startID, endID, 400)
	if err != nil {
		t.Fatalf("候補経路探索に失敗しました: %v", err)
	}

	if len(allPaths) != 2 {
		t.Errorf("候補経路の数が不正です: got %d, want 2", len(allPaths))
	}
}
