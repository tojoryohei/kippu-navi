package fareio

import (
	"encoding/json"
	"fmt"
	"io"
	"os"
	"split-pass-api/internal/domain"
)

type rawFareData struct {
	OneMonth   int `json:"OneMonth"`
	ThreeMonth int `json:"ThreeMonth"`
	SixMonth   int `json:"SixMonth"`
}

type rawRouteAndFare struct {
	Route []string    `json:"route"`
	Fare  rawFareData `json:"fare"`
}

// SpecificFareJSONLoader は JSON ファイルから特定区間運賃をロードします。
type SpecificFareJSONLoader struct{}

// Load は JSON ファイルを読み込み、特定運賃区間や調整運賃区間の配列を返します。
func (l *SpecificFareJSONLoader) Load(path string) ([]domain.RouteAndFare, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("fareio: JSONファイルのオープンに失敗しました: %w", err)
	}
	defer file.Close()

	var rawData []rawRouteAndFare
	decoder := json.NewDecoder(file)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&rawData); err != nil {
		return nil, fmt.Errorf("fareio: JSONのデコードに失敗しました: %w", err)
	}

	if _, err := decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("fareio: JSONデータの末尾に予期せぬデータが含まれています")
	}

	data := make([]domain.RouteAndFare, 0, len(rawData))
	for _, raw := range rawData {
		if len(raw.Route) < 2 {
			return nil, fmt.Errorf("fareio: 経路には少なくとも2つの駅が必要です（不正なデータ: %v）", raw.Route)
		}

		data = append(data, domain.RouteAndFare{
			Route: raw.Route,
			Fare: domain.PassFare{
				OneMonth:   raw.Fare.OneMonth,
				ThreeMonth: raw.Fare.ThreeMonth,
				SixMonth:   raw.Fare.SixMonth,
			},
		})
	}

	return data, nil
}
