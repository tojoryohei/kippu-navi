package fare

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed data/standardTrunkFares.json
var standardTrunkFaresJSON []byte

//go:embed data/standardLocalFares.json
var standardLocalFaresJSON []byte

func NewStandardCalculator() (*StandardCalculator, error) {
	var standardTrunkFares [101]PassFare
	if err := json.Unmarshal(standardTrunkFaresJSON, &standardTrunkFares); err != nil {
		return nil, fmt.Errorf("standardTrunkFaresの読み込みに失敗しました: %w", err)
	}
	var standardLocalFares [101]PassFare
	if err := json.Unmarshal(standardLocalFaresJSON, &standardLocalFares); err != nil {
		return nil, fmt.Errorf("standardLocalFaresの読み込みに失敗しました: %w", err)
	}
	return &StandardCalculator{trunkFares: standardTrunkFares, localFares: standardLocalFares}, nil
}

type StandardCalculator struct {
	trunkFares [101]PassFare
	localFares [101]PassFare
}

func (c *StandardCalculator) Calculate(params PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
