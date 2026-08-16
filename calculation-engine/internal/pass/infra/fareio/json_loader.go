//go:build !js || !wasm

package fareio

import (
	"bytes"
	passdomain "calculation-engine/internal/pass/domain"
	"encoding/json"
	"fmt"
	"io"
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

func loadRouteAndFares(data []byte, name string) ([]passdomain.RouteAndFare, error) {
	var rawData []rawRouteAndFare
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&rawData); err != nil {
		return nil, fmt.Errorf("%sのデコードに失敗しました: %w", name, err)
	}

	if _, err := decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("%sデータの末尾に予期せぬデータが含まれています", name)
	}

	dataResult := make([]passdomain.RouteAndFare, 0, len(rawData))
	for _, raw := range rawData {
		if len(raw.Route) < 2 {
			return nil, fmt.Errorf("%s: 経路には少なくとも2つの駅が必要です（不正なデータ: %v）", name, raw.Route)
		}
		dataResult = append(dataResult, passdomain.RouteAndFare{
			Route: raw.Route,
			Fare: passdomain.PassPrice{
				OneMonth:   raw.Fare.OneMonth,
				ThreeMonth: raw.Fare.ThreeMonth,
				SixMonth:   raw.Fare.SixMonth,
			},
		})
	}
	return dataResult, nil
}
