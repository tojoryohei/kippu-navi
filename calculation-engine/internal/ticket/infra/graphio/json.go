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
	Line                   string           `json:"line"`
	Station0               string           `json:"station0"`
	Station1               string           `json:"station1"`
	EigyoKilo              domain.DeciKilo  `json:"eigyoKilo"`
	GiseiKilo              domain.DeciKilo  `json:"giseiKilo"`
	IsLocal                bool             `json:"isLocal"`
	Company                domain.CompanyID `json:"company"`
	IsTrainSpecificSection bool             `json:"isTrainSpecificSection"`
	IsBoldLineArea         bool             `json:"isBoldLineArea"`
	IsBarrierFreeSection   bool             `json:"isBarrierFreeSection"`
	IsIcPassArea           bool             `json:"isIcPassArea"`
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
	var physicalEdges []rawTicketEdge
	var virtualEdges []rawTicketEdge

	for i, r := range physicalReaders {
		var edges []rawTicketEdge
		decoder := json.NewDecoder(r)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&edges); err != nil {
			return nil, nil, fmt.Errorf("graphio: physical JSONのデコードに失敗しました (reader index %d): %w", i, err)
		}
		physicalEdges = append(physicalEdges, edges...)
	}

	for i, r := range virtualReaders {
		var edges []rawTicketEdge
		decoder := json.NewDecoder(r)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&edges); err != nil {
			return nil, nil, fmt.Errorf("graphio: virtual JSONのデコードに失敗しました (reader index %d): %w", i, err)
		}
		virtualEdges = append(virtualEdges, edges...)
	}

	if len(physicalEdges) == 0 && len(virtualEdges) == 0 {
		return nil, nil, fmt.Errorf("graphio: %w", domain.ErrEmptyGraph)
	}

	capacity := (len(physicalEdges) + len(virtualEdges)) * 2
	mapper := &graph.StationNameIDMapper{
		NameToID: make(map[string]int, capacity),
		IDToName: make([]string, 0, capacity),
	}

	physicalGraph = graph.NewGraphWithMapper(capacity, mapper)
	fullGraph = graph.NewGraphWithMapper(capacity, mapper)

	addEdgeToGraph := func(g *graph.RailwayGraph, re rawTicketEdge) {
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
		}

		g.AddEdge(ticketdomain.TicketEdge{
			Edge:           edgeData,
			Line:           re.Line,
			IsBoldLineArea: re.IsBoldLineArea,
		})

		edgeDataRev := edgeData
		edgeDataRev.FromID = id1
		edgeDataRev.ToID = id0

		g.AddEdge(ticketdomain.TicketEdge{
			Edge:           edgeDataRev,
			Line:           re.Line,
			IsBoldLineArea: re.IsBoldLineArea,
		})
	}

	// 物理エッジは両方のグラフに追加
	for _, re := range physicalEdges {
		addEdgeToGraph(physicalGraph, re)
		addEdgeToGraph(fullGraph, re)
	}

	// 仮想エッジはフルグラフのみに追加
	for _, re := range virtualEdges {
		addEdgeToGraph(fullGraph, re)
	}

	return physicalGraph, fullGraph, nil
}
