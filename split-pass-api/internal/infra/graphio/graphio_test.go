package graphio_test

import (
	"errors"
	"os"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/infra/graphio"
	"testing"
)

// newTestGraph はテスト用の共通グラフを構築します。
//
//	A --(100)--> B --(200)--> C
//	A --(400)--------------> C
func newTestGraph() (*graph.Graph, int, int, int) {
	g := graph.NewGraph(10)
	startID := g.GetOrAddID("A")
	midID := g.GetOrAddID("B")
	endID := g.GetOrAddID("C")

	g.AddEdge(domain.Edge{FromID: startID, ToID: midID, GiseiKilo: 100, EigyoKilo: 100})
	g.AddEdge(domain.Edge{FromID: midID, ToID: endID, GiseiKilo: 200, EigyoKilo: 200})
	g.AddEdge(domain.Edge{FromID: startID, ToID: endID, GiseiKilo: 400, EigyoKilo: 400})

	return g, startID, midID, endID
}

func TestSaveAndLoadBinary(t *testing.T) {
	g, startID, _, endID := newTestGraph()

	tmpFile := "test_graph.gob"
	defer os.Remove(tmpFile)

	if err := graphio.SaveBinary(g, tmpFile); err != nil {
		t.Fatalf("バイナリ保存に失敗しました: %v", err)
	}

	loader := &graphio.GobLoader{}
	g2, err := loader.Load(tmpFile)
	if err != nil {
		t.Fatalf("バイナリ読み込みに失敗しました: %v", err)
	}

	res, err := g2.FindShortestPathGisei(startID, endID)
	if err != nil {
		t.Fatalf("読み込み後の経路探索に失敗しました: %v", err)
	}
	if res.GiseiKilo != 300 {
		t.Errorf("読み込み後の最短距離が不正です: got %v, want 300", res.GiseiKilo)
	}
}

func TestGobLoader_Load_FileNotFound(t *testing.T) {
	loader := &graphio.GobLoader{}
	_, err := loader.Load("nonexistent.gob")
	if err == nil {
		t.Error("存在しないファイルに対してエラーが返されませんでした")
	}
}

func TestGobLoader_Load_EmptyFile(t *testing.T) {
	tmpFile := "test_empty.gob"
	f, err := os.Create(tmpFile)
	if err != nil {
		t.Fatalf("一時ファイルの作成に失敗しました: %v", err)
	}
	f.Close()
	defer os.Remove(tmpFile)

	loader := &graphio.GobLoader{}
	_, err = loader.Load(tmpFile)
	if err == nil {
		t.Error("空ファイルに対してエラーが返されませんでした")
	}
}

func TestSaveBinary_InvalidGraph(t *testing.T) {
	err := graphio.SaveBinary(&graph.Graph{}, "should_not_be_created.gob")
	defer os.Remove("should_not_be_created.gob")

	if err == nil {
		t.Error("不正なグラフに対してエラーが返されませんでした")
	}
	if !errors.Is(err, graph.ErrInvalidGraph) {
		t.Errorf("期待するエラーと異なります: got %v, want %v", err, graph.ErrInvalidGraph)
	}
}
