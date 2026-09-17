package fareio

import (
	_ "embed"
	"encoding/json"
	"fmt"

	passdomain "calculation-engine/internal/pass/domain"
)

//go:embed data/privatePassFares.json
var privatePassFaresJSON []byte

// PrivateFare 構造体は私鉄の定期運賃区間を定義します。
type PrivateFare struct {
	StartStation string               `json:"startStation"`
	EndStation   string               `json:"endStation"`
	Fare         passdomain.PassPrice `json:"fare"`
}

// PrivateFareRegistry は私鉄定期運賃を管理するレジストリです。
type PrivateFareRegistry struct {
	fares []PrivateFare
}

// NewPrivateFareRegistry はJSONからデータを読み込んでレジストリを初期化します。
func NewPrivateFareRegistry() (*PrivateFareRegistry, error) {
	var fares []PrivateFare
	if err := json.Unmarshal(privatePassFaresJSON, &fares); err != nil {
		return nil, fmt.Errorf("私鉄定期運賃JSONのパースに失敗しました: %w", err)
	}
	return &PrivateFareRegistry{fares: fares}, nil
}

// GetFare は指定された開始駅と終了駅間の私鉄定期運賃を取得します。
// 両方向（Start->End, End->Start）でマッチします。
func (r *PrivateFareRegistry) GetFare(startStation, endStation string) (passdomain.PassPrice, bool) {
	for _, f := range r.fares {
		if (f.StartStation == startStation && f.EndStation == endStation) ||
			(f.StartStation == endStation && f.EndStation == startStation) {
			return f.Fare, true
		}
	}
	return passdomain.PassPrice{}, false
}
