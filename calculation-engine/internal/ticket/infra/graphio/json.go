package graphio

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"encoding/json"
	"fmt"
	"io"
)

// JSONLoader は JSON ファイルから乗車券用グラフをロードします。
type JSONLoader struct{}

type rawTicketEdge struct {
	Line                   string                `json:"line"`
	Station0               string                `json:"station0"`
	Station1               string                `json:"station1"`
	EigyoKilo              domain.DeciKilo       `json:"eigyoKilo"`
	GiseiKilo              domain.DeciKilo       `json:"giseiKilo"`
	IsLocal                bool                  `json:"isLocal"`
	Company                domain.CompanyID      `json:"company"`
	IsTrainSpecificSection bool                  `json:"isTrainSpecificSection"`
	IsBoldLineArea         bool                  `json:"isBoldLineArea"`
	IsBarrierFreeSection   bool                  `json:"isBarrierFreeSection"`
	IsIcPassArea           bool                  `json:"isIcPassArea"`
	SuburbanArea           domain.SuburbanAreaID `json:"suburbanArea"`
}

func decodeTicketEdges(readers []io.Reader, kind string) ([]rawTicketEdge, error) {
	var result []rawTicketEdge
	for i, r := range readers {
		var edges []rawTicketEdge
		decoder := json.NewDecoder(r)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&edges); err != nil {
			return nil, fmt.Errorf("graphio: %s JSONのデコードに失敗しました (reader index %d): %w", kind, i, err)
		}
		result = append(result, edges...)
	}
	return result, nil
}

func addEdgeToGraph(g *graph.RailwayGraph, re rawTicketEdge) {
	id0 := g.GetOrAddID(re.Station0)
	id1 := g.GetOrAddID(re.Station1)
	edgeData := domain.Edge{
		FromID:                 id0,
		ToID:                   id1,
		EigyoKilo:              re.EigyoKilo,
		GiseiKilo:              re.GiseiKilo,
		IsLocal:                re.IsLocal,
		Company:                re.Company,
		IsTrainSpecificSection: re.IsTrainSpecificSection,
		IsBarrierFreeSection:   re.IsBarrierFreeSection,
		SuburbanArea:           re.SuburbanArea,
	}
	g.AddEdge(ticketdomain.TicketEdge{
		Edge:           edgeData,
		Line:           re.Line,
		IsBoldLineArea: re.IsBoldLineArea,
	})

	edgeData.FromID, edgeData.ToID = id1, id0
	g.AddEdge(ticketdomain.TicketEdge{
		Edge:           edgeData,
		Line:           re.Line,
		IsBoldLineArea: re.IsBoldLineArea,
	})
}

// Load は複数の JSON データを読み込み、新しい乗車券用 Graph を構築して返します。
// 各リーダーは rawTicketEdge の配列を含んでいる必要があります。
// データが空またはエッジが0件の場合はエラーを返します。
func (l *JSONLoader) Load(readers ...io.Reader) (*graph.RailwayGraph, error) {
	_, full, err := l.LoadSeparatedGraphs(readers, nil)
	return full, err
}

// LoadSeparatedGraphs は物理経路用と全エッジ用（特例エッジ含む）の2つのグラフを構築し返します。
func (l *JSONLoader) LoadSeparatedGraphs(physicalReaders []io.Reader, virtualReaders []io.Reader) (physicalGraph, fullGraph *graph.RailwayGraph, err error) {
	physicalEdges, err := decodeTicketEdges(physicalReaders, "physical")
	if err != nil {
		return nil, nil, err
	}
	virtualEdges, err := decodeTicketEdges(virtualReaders, "virtual")
	if err != nil {
		return nil, nil, err
	}

	if len(physicalEdges) == 0 && len(virtualEdges) == 0 {
		return nil, nil, fmt.Errorf("graphio: %w", domain.ErrEmptyGraph)
	}

	capacity := (len(physicalEdges) + len(virtualEdges)) * 2
	mapper := &graph.StationNameIDMapper{
		NameToID: make(map[string]int, capacity),
		IDToName: make([]string, 0, capacity),
	}

	fullGraph = graph.NewGraphWithMapper(capacity, mapper)

	// 物理エッジを先頭に追加し、駅ごとの境界を記録する
	for _, re := range physicalEdges {
		addEdgeToGraph(fullGraph, re)
	}
	fullGraph.PhysicalEdgeCounts = make([]int, len(fullGraph.Edges))
	for stationID, edges := range fullGraph.Edges {
		fullGraph.PhysicalEdgeCounts[stationID] = len(edges)
	}

	// 仮想エッジはフルグラフのみに追加
	for _, re := range virtualEdges {
		addEdgeToGraph(fullGraph, re)
	}

	// 探索用グラフはデータ本体を共有し、物理エッジの範囲だけを公開する
	physicalGraph = graph.NewPhysicalGraphView(fullGraph)

	return physicalGraph, fullGraph, nil
}

// AddVirtualEdges は既存グラフへ運賃計算専用の仮想エッジを追加します。
func (l *JSONLoader) AddVirtualEdges(g *graph.RailwayGraph, readers ...io.Reader) error {
	if g == nil {
		return fmt.Errorf("graphio: graph is nil")
	}
	edges, err := decodeTicketEdges(readers, "virtual")
	if err != nil {
		return err
	}
	for _, edge := range edges {
		addEdgeToGraph(g, edge)
	}
	return nil
}
