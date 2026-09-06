package graphio

import (
	"io"
	"strings"
	"testing"

	ticketdomain "calculation-engine/internal/ticket/domain"
)

const physicalEdgeJSON = `[{"line":"在来線","station0":"A","station1":"B","eigyoKilo":10,"giseiKilo":10,"isLocal":false,"company":2,"isTrainSpecificSection":false,"isBoldLineArea":false,"isBarrierFreeSection":false,"isIcPassArea":false,"suburbanArea":0}]`
const virtualEdgeJSON = `[{"line":"仮想線","station0":"A","station1":"C","eigyoKilo":5,"giseiKilo":5,"isLocal":false,"company":2,"isTrainSpecificSection":false,"isBoldLineArea":false,"isBarrierFreeSection":false,"isIcPassArea":false,"suburbanArea":0}]`

func TestLoadSeparatedGraphsKeepsVirtualEdgesOutOfSearchGraph(t *testing.T) {
	loader := &JSONLoader{}
	searchGraph, fareGraph, err := loader.LoadSeparatedGraphs(
		[]io.Reader{strings.NewReader(physicalEdgeJSON)},
		[]io.Reader{strings.NewReader(virtualEdgeJSON)},
	)
	if err != nil {
		t.Fatalf("グラフのロードに失敗しました: %v", err)
	}

	aID, _ := searchGraph.GetID("A")
	cID, _ := searchGraph.GetID("C")
	if hasEdgeTo(searchGraph.GetEdges(aID), cID) {
		t.Fatal("経路探索グラフに仮想エッジが含まれています")
	}
	if !hasEdgeTo(fareGraph.GetEdges(aID), cID) {
		t.Fatal("運賃計算グラフに仮想エッジが含まれていません")
	}
}

func TestAddVirtualEdgesAddsEdgesOnlyToTargetGraph(t *testing.T) {
	loader := &JSONLoader{}
	searchGraph, fareGraph, err := loader.LoadSeparatedGraphs(
		[]io.Reader{strings.NewReader(physicalEdgeJSON)},
		nil,
	)
	if err != nil {
		t.Fatalf("物理グラフのロードに失敗しました: %v", err)
	}
	if err := loader.AddVirtualEdges(fareGraph, strings.NewReader(virtualEdgeJSON)); err != nil {
		t.Fatalf("仮想エッジの追加に失敗しました: %v", err)
	}

	aID, _ := searchGraph.GetID("A")
	cID, ok := fareGraph.GetID("C")
	if !ok {
		t.Fatal("運賃計算グラフに仮想エッジの駅が追加されていません")
	}
	if hasEdgeTo(searchGraph.GetEdges(aID), cID) {
		t.Fatal("経路探索グラフに仮想エッジが混入しました")
	}
	if !hasEdgeTo(fareGraph.GetEdges(aID), cID) {
		t.Fatal("運賃計算グラフに仮想エッジが追加されていません")
	}
}

func hasEdgeTo(edges []ticketdomain.TicketEdge, destination int) bool {
	for _, edge := range edges {
		if edge.ToID == destination {
			return true
		}
	}
	return false
}
