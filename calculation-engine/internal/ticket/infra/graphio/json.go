package graphio

import (
	"encoding/json"
	"fmt"
	"io"
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
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
	IsBarrierFreeSection   bool             `json:"isBarrierFreeSection"`
	IsBoldLineArea         bool             `json:"isBoldLineArea"`
}

// Load は JSON データを読み込み、新しい乗車券用 Graph を構築して返します。
// データが空またはエッジが0件の場合はエラーを返します。
func (l *JSONLoader) Load(r io.Reader) (*graph.RailwayGraph, error) {
	var edges []rawTicketEdge
	decoder := json.NewDecoder(r)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&edges); err != nil {
		return nil, fmt.Errorf("graphio: JSONのデコードに失敗しました: %w", err)
	}

	if _, err := decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("graphio: JSONデータの末尾に予期せぬデータが含まれています")
	}

	if len(edges) == 0 {
		return nil, fmt.Errorf("graphio: %w", domain.ErrEmptyGraph)
	}

	g := graph.NewGraph(len(edges) * 2)

	for _, re := range edges {
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
