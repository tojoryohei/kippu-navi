package graphio

import (
	"io"
	"strings"
	"testing"

	ticketdomain "calculation-engine/internal/ticket/domain"
)

const physicalEdgeJSON = `[{"line":"在来線","station0":"A","station1":"B","eigyoKilo":10,"giseiKilo":10,"isLocal":false,"company":2,"isTrainSpecificSection":false,"isBoldLineArea":false,"isBarrierFreeSection":false,"isIcPassArea":false,"suburbanArea":0}]`
const virtualEdgeJSON = `[{"line":"仮想線","station0":"A","station1":"C","eigyoKilo":5,"giseiKilo":5,"isLocal":false,"company":2,"isTrainSpecificSection":false,"isBoldLineArea":false,"isBarrierFreeSection":false,"isIcPassArea":false,"suburbanArea":0}]`
const virtualShortcutJSON = `[{"line":"仮想線","station0":"A","station1":"C","eigyoKilo":1,"giseiKilo":1,"isLocal":false,"company":2,"isTrainSpecificSection":false,"isBoldLineArea":false,"isBarrierFreeSection":false,"isIcPassArea":false,"suburbanArea":0},{"line":"仮想線","station0":"C","station1":"B","eigyoKilo":1,"giseiKilo":1,"isLocal":false,"company":2,"isTrainSpecificSection":false,"isBoldLineArea":false,"isBarrierFreeSection":false,"isIcPassArea":false,"suburbanArea":0}]`

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

	searchEdges := searchGraph.GetEdges(aID)
	fareEdges := fareGraph.GetEdges(aID)
	if len(searchEdges) == 0 || len(fareEdges) == 0 || &searchEdges[0] != &fareEdges[0] {
		t.Fatal("探索用グラフと運賃計算グラフが物理エッジを共有していません")
	}
}

func TestPhysicalGraphViewExcludesVirtualEdgesFromShortestPath(t *testing.T) {
	loader := &JSONLoader{}
	searchGraph, fareGraph, err := loader.LoadSeparatedGraphs(
		[]io.Reader{strings.NewReader(physicalEdgeJSON)},
		[]io.Reader{strings.NewReader(virtualShortcutJSON)},
	)
	if err != nil {
		t.Fatalf("グラフのロードに失敗しました: %v", err)
	}
	if err := searchGraph.Validate(); err != nil {
		t.Fatalf("探索用グラフの検証に失敗しました: %v", err)
	}
	if err := fareGraph.Validate(); err != nil {
		t.Fatalf("運賃計算グラフの検証に失敗しました: %v", err)
	}

	aID, _ := searchGraph.GetID("A")
	bID, _ := searchGraph.GetID("B")
	searchPath, err := searchGraph.FindShortestPathGisei(aID, bID)
	if err != nil {
		t.Fatalf("物理経路の探索に失敗しました: %v", err)
	}
	if len(searchPath.StationIDs) != 2 || searchPath.GiseiKilo != 10 {
		t.Fatalf("探索用グラフが仮想エッジを使用しました: path=%v, gisei=%d", searchPath.StationIDs, searchPath.GiseiKilo)
	}

	farePath, err := fareGraph.FindShortestPathGisei(aID, bID)
	if err != nil {
		t.Fatalf("完全グラフの探索に失敗しました: %v", err)
	}
	if len(farePath.StationIDs) != 3 || farePath.GiseiKilo != 2 {
		t.Fatalf("完全グラフが仮想エッジを使用していません: path=%v, gisei=%d", farePath.StationIDs, farePath.GiseiKilo)
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
