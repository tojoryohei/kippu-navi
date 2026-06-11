package graphio

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
)

var ErrEmptyEdges = errors.New("エッジデータが空です")

// JSONLoader は JSON ファイルからグラフをロードします。
type JSONLoader struct{}

type rawEdge struct {
	Station0               string           `json:"station0"`
	Station1               string           `json:"station1"`
	EigyoKilo              domain.DeciKilo  `json:"eigyoKilo"`
	GiseiKilo              domain.DeciKilo  `json:"giseiKilo"`
	IsLocal                bool             `json:"isLocal"`
	Company                domain.CompanyID `json:"company"`
	IsTrainSpecificSection bool             `json:"isTrainSpecificSection"`
	IsBarrierFreeSection   bool             `json:"isBarrierFreeSection"`
	IsIcPassArea           bool             `json:"isIcPassArea"`
}

// Load は JSON データを読み込み、新しい Graph を構築して返します。
// データが空またはエッジが0件の場合はエラーを返します。
func (l *JSONLoader) Load(r io.Reader) (graph.Graph, error) {
	var edges []rawEdge
	decoder := json.NewDecoder(r)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&edges); err != nil {
		return nil, fmt.Errorf("graphio: JSONのデコードに失敗しました: %w", err)
	}

	if _, err := decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("graphio: JSONデータの末尾に予期せぬデータが含まれています")
	}

	if len(edges) == 0 {
		return nil, fmt.Errorf("graphio: %w", ErrEmptyEdges)
	}

	// エッジ数の2倍（双方向）を初期容量として確保
	g := graph.NewGraph(len(edges) * 2)

	for _, re := range edges {
		id0 := g.GetOrAddID(re.Station0)
		id1 := g.GetOrAddID(re.Station1)

		// 双方向エッジとして追加（鉄道網は通常双方向）
		g.AddEdge(domain.Edge{
			FromID:                 id0,
			ToID:                   id1,
			EigyoKilo:              re.EigyoKilo,
			GiseiKilo:              re.GiseiKilo,
			IsLocal:                re.IsLocal,
			Company:                re.Company,
			IsTrainSpecificSection: re.IsTrainSpecificSection,
			IsBarrierFreeSection:   re.IsBarrierFreeSection,
			IsIcPassArea:           re.IsIcPassArea,
		})
		g.AddEdge(domain.Edge{
			FromID:                 id1,
			ToID:                   id0,
			EigyoKilo:              re.EigyoKilo,
			GiseiKilo:              re.GiseiKilo,
			IsLocal:                re.IsLocal,
			Company:                re.Company,
			IsTrainSpecificSection: re.IsTrainSpecificSection,
			IsBarrierFreeSection:   re.IsBarrierFreeSection,
			IsIcPassArea:           re.IsIcPassArea,
		})
	}

	return g, nil
}
