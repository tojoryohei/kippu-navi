package fare

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"split-pass-api/internal/domain"
)

//go:embed data/eastTrunkFares.json
var eastTrunkFaresJSON []byte

//go:embed data/eastLocalFares.json
var eastLocalFaresJSON []byte

func NewEastCalculator() (*EastCalculator, error) {
	var eastTrunkFares [101]domain.PassFare
	if err := json.Unmarshal(eastTrunkFaresJSON, &eastTrunkFares); err != nil {
		return nil, fmt.Errorf("eastTrunkFaresの読み込みに失敗しました: %w", err)
	}
	var eastLocalFares [101]domain.PassFare
	if err := json.Unmarshal(eastLocalFaresJSON, &eastLocalFares); err != nil {
		return nil, fmt.Errorf("eastLocalFaresの読み込みに失敗しました: %w", err)
	}
	return &EastCalculator{trunkFares: eastTrunkFares, localFares: eastLocalFares}, nil
}

type EastCalculator struct {
	trunkFares [101]domain.PassFare
	localFares [101]domain.PassFare
}

func (c *EastCalculator) Calculate(params domain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
