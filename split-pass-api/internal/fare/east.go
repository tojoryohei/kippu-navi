package fare

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed data/eastTrunkFares.json
var eastTrunkFaresJSON []byte

//go:embed data/eastLocalFares.json
var eastLocalFaresJSON []byte

func NewEastCalculator() (*EastCalculator, error) {
	var eastTrunkFares [101]PassFare
	if err := json.Unmarshal(eastTrunkFaresJSON, &eastTrunkFares); err != nil {
		return nil, fmt.Errorf("eastTrunkFaresの読み込みに失敗しました: %w", err)
	}
	var eastLocalFares [101]PassFare
	if err := json.Unmarshal(eastLocalFaresJSON, &eastLocalFares); err != nil {
		return nil, fmt.Errorf("eastLocalFaresの読み込みに失敗しました: %w", err)
	}
	return &EastCalculator{trunkFares: eastTrunkFares, localFares: eastLocalFares}, nil
}

type EastCalculator struct {
	trunkFares [101]PassFare
	localFares [101]PassFare
}

func (c *EastCalculator) Calculate(params PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
