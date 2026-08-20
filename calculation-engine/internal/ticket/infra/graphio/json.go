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
	var allEdges []rawTicketEdge

	for i, r := range readers {
		var edges []rawTicketEdge
		decoder := json.NewDecoder(r)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&edges); err != nil {
			return nil, fmt.Errorf("graphio: JSONのデコードに失敗しました (reader index %d): %w", i, err)
		}

		if _, err := decoder.Token(); err != io.EOF {
			return nil, fmt.Errorf("graphio: JSONデータの末尾に予期せぬデータが含まれています (reader index %d)", i)
		}
		
		allEdges = append(allEdges, edges...)
	}

	if len(allEdges) == 0 {
		return nil, fmt.Errorf("graphio: %w", domain.ErrEmptyGraph)
	}

	g := graph.NewGraph(len(allEdges) * 2)

	for _, re := range allEdges {
		id0 := g.GetOrAddID(re.Station0)
		id1 := g.GetOrAddID(re.Station1)

		g.AddEdge(ticketdomain.TicketEdge{
			Edge: domain.Edge{
				FromID:                 id0,
				ToID:                   id1,
				EigyoKilo:              re.EigyoKilo,
				GiseiKilo:              re.GiseiKilo,
				IsLocal:                re.IsLocal,
				Company:                re.Company,
				IsTrainSpecificSection: re.IsTrainSpecificSection,
				IsBarrierFreeSection:   re.IsBarrierFreeSection,
			},
			Line:           re.Line,
			IsBoldLineArea: re.IsBoldLineArea,
		})
		g.AddEdge(ticketdomain.TicketEdge{
			Edge: domain.Edge{
				FromID:                 id1,
				ToID:                   id0,
				EigyoKilo:              re.EigyoKilo,
				GiseiKilo:              re.GiseiKilo,
				IsLocal:                re.IsLocal,
				Company:                re.Company,
				IsTrainSpecificSection: re.IsTrainSpecificSection,
				IsBarrierFreeSection:   re.IsBarrierFreeSection,
			},
			Line:           re.Line,
			IsBoldLineArea: re.IsBoldLineArea,
		})
	}

	return g, nil
}
