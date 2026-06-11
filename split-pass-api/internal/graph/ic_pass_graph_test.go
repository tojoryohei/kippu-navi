package graph

import (
	"split-pass-api/internal/domain"
	"testing"
)

func TestNewIcPassGraph(t *testing.T) {
	t.Run("正常系: ICエリアのみ抽出され、IDマッパーが共有されること", func(t *testing.T) {
		// 1. テストデータの構築
		// A --(IC)--> B --(Non-IC)--> C
		g := NewGraph(3)
		idA := g.GetOrAddID("A")
		idB := g.GetOrAddID("B")
		idC := g.GetOrAddID("C")

		// A-B間はIC対応
		g.AddEdge(domain.Edge{FromID: idA, ToID: idB, IsIcPassArea: true, GiseiKilo: 100})
		// B-C間はIC非対応
		g.AddEdge(domain.Edge{FromID: idB, ToID: idC, IsIcPassArea: false, GiseiKilo: 200})

		// 2. ICグラフの生成
		icG, err := NewIcPassGraph(g)
		if err != nil {
			t.Fatalf("予期せぬエラーが発生しました: %v", err)
		}

		// 3. 検証
		if icG.NumStations() != g.NumStations() {
			t.Errorf("駅数が一致しません: got %d, want %d", icG.NumStations(), g.NumStations())
		}

		// Aの隣接エッジを確認 (Bへのエッジがあるはず)
		edgesA := icG.GetEdges(idA)
		if len(edgesA) != 1 {
			t.Fatalf("Aの隣接エッジ数が不正です: got %d, want 1", len(edgesA))
		}
		if edgesA[0].ToID != idB {
			t.Errorf("Aからの接続先が不正です: got %d, want %d", edgesA[0].ToID, idB)
		}

		// Bの隣接エッジを確認 (Cへのエッジはないはず)
		edgesB := icG.GetEdges(idB)
		if len(edgesB) != 0 {
			t.Errorf("Bの隣接エッジ数が不正です: got %d, want 0", len(edgesB))
		}

		// IDマッパーの共有を確認
		if icG.StationNameIDMapper != g.StationNameIDMapper {
			t.Error("StationNameIDMapper が共有されていません")
		}

		nameA, _ := icG.GetID("A")
		if nameA != idA {
			t.Errorf("共有されたマッパーでのID取得に失敗しました: got %d, want %d", nameA, idA)
		}
	})

	t.Run("異常系: baseグラフがnilの場合はエラーとなること", func(t *testing.T) {
		icG, err := NewIcPassGraph(nil)
		if err == nil {
			t.Error("エラーが発生するはずですが、nilが返りました")
		}
		if icG != nil {
			t.Error("エラー時はグラフがnilになるはずです")
		}
	})

	t.Run("異常系: 駅数とエッジスライスのサイズが不一致（データ破損）の場合はエラーとなること", func(t *testing.T) {
		g := NewGraph(3)

		// 意図的に内部データを破壊し、不整合な状態を作り出す
		g.Edges = make([][]domain.Edge, 1) // 駅数は3だが、Edgesはサイズ1しかない状態

		icG, err := NewIcPassGraph(g)
		if err == nil {
			t.Error("データ不整合のためエラーが発生するはずですが、nilが返りました")
		}
		if icG != nil {
			t.Error("エラー時はグラフがnilになるはずです")
		}
	})
}
