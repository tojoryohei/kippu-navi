package fareio

import (
	"bytes"
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"encoding/json"
	"fmt"
	"io"
)

type rawRouteAndFare struct {
	Route []string `json:"route"`
	Fare  int      `json:"fare"`
}

// loadRouteAndFare は JSON データを読み込み、特定運賃区間や調整運賃区間の配列を返します。
func loadRouteAndFare(data []byte) ([]ticketdomain.RouteAndFare, error) {
	var rawData []rawRouteAndFare
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	
	if err := decoder.Decode(&rawData); err != nil {
		return nil, fmt.Errorf("fareio: JSONのデコードに失敗しました: %w", err)
	}

	if _, err := decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("fareio: JSONデータの末尾に予期せぬデータが含まれています")
	}

	result := make([]ticketdomain.RouteAndFare, 0, len(rawData))
	for _, raw := range rawData {
		if len(raw.Route) < 2 {
			return nil, fmt.Errorf("fareio: %w (不正なデータ: %v)", domain.ErrInvalidPath, raw.Route)
		}

		result = append(result, ticketdomain.RouteAndFare{
			Route: raw.Route,
			Fare:  raw.Fare,
		})
	}

	return result, nil
}
