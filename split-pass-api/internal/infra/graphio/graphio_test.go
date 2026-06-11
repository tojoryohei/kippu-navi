package graphio_test

import (
	"bytes"
	"encoding/gob"
	"errors"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/infra/graphio"
	"strings"
	"testing"
)

// newTestGraph はテスト用の共通グラフを構築します。
//
//	A --(100)--> B --(200)--> C
//	A --(400)--------------> C
func newTestGraph() (graph.Graph, int, int, int) {
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

	var buf bytes.Buffer
	if err := gob.NewEncoder(&buf).Encode(g); err != nil {
		t.Fatalf("バイナリのエンコードに失敗しました: %v", err)
	}

	loader := &graphio.GobLoader{}
	g2, err := loader.Load(&buf)
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

func TestGobLoader_Load_InvalidData(t *testing.T) {
	loader := &graphio.GobLoader{}
	reader := strings.NewReader("not a gob data")
	_, err := loader.Load(reader)
	if err == nil {
		t.Error("不正なデータに対してエラーが返されませんでした")
	}
}

func TestGobLoader_Load_EmptyReader(t *testing.T) {
	reader := bytes.NewReader([]byte{})
	loader := &graphio.GobLoader{}
	_, err := loader.Load(reader)
	if err == nil {
		t.Error("空のデータに対してエラーが返されませんでした")
	}
}

func TestSaveBinary_InvalidGraph(t *testing.T) {
	var buf bytes.Buffer
	err := graphio.SaveBinary(&graph.RailwayGraph{}, &buf)

	if err == nil {
		t.Error("不正なグラフに対してエラーが返されませんでした")
	}
	if !errors.Is(err, graph.ErrInvalidGraph) {
		t.Errorf("期待するエラーと異なります: got %v, want %v", err, graph.ErrInvalidGraph)
	}
}

func TestJSONLoader_Load(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{
			name: "正常系",
			input: `[
				{
					"station0": "東京",
					"station1": "神田",
					"eigyoKilo": 13,
					"giseiKilo": 13,
					"isLocal": false,
					"company": 1,
					"isTrainSpecificSection": true,
					"isBarrierFreeSection": true
				}
			]`,
			wantErr: false,
		},
		{
			name:    "エッジデータが空",
			input:   `[]`,
			wantErr: true,
		},
		{
			name:    "JSONデータの末尾に予期せぬデータが含まれる",
			input:   `[] { "extra": 1 }`,
			wantErr: true,
		},
		{
			name: "未知のフィールドが含まれる",
			input: `[
				{
					"station0": "東京",
					"station1": "神田",
					"unknown": "field"
				}
			]`,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			reader := strings.NewReader(tt.input)

			loader := &graphio.JSONLoader{}
			got, err := loader.Load(reader)

			if (err != nil) != tt.wantErr {
				t.Errorf("Load() エラー = %v, 期待されるエラー発生 = %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr && got == nil {
				t.Error("Load() 成功したはずですが、結果が nil です")
			}
		})
	}
}
