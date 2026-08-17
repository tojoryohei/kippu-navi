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

type rawPathAndFare struct {
	Path []string    `json:"path"`
	Fare  rawFareData `json:"fare"`
}

func loadPathAndFares(data []byte, name string) ([]passdomain.PathAndFare, error) {
	var rawData []rawPathAndFare
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&rawData); err != nil {
		return nil, fmt.Errorf("%sのデコードに失敗しました: %w", name, err)
	}

	if _, err := decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("%sデータの末尾に予期せぬデータが含まれています", name)
	}

	dataResult := make([]passdomain.PathAndFare, 0, len(rawData))
	for _, raw := range rawData {
		if len(raw.Path) < 2 {
			return nil, fmt.Errorf("%s: 経路には少なくとも2つの駅が必要です（不正なデータ: %v）", name, raw.Path)
		}
		dataResult = append(dataResult, passdomain.PathAndFare{
			Path: raw.Path,
			Fare: passdomain.PassPrice{
				OneMonth:   raw.Fare.OneMonth,
				ThreeMonth: raw.Fare.ThreeMonth,
				SixMonth:   raw.Fare.SixMonth,
			},
		})
	}
	return dataResult, nil
}
