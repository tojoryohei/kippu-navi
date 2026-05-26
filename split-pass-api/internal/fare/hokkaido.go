package fare

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed data/hokkaidoTrunkFares.json
var hokkaidoTrunkFaresJSON []byte

//go:embed data/hokkaidoLocalFares.json
var hokkaidoLocalFaresJSON []byte

func NewHokkaidoCalculator() (*HokkaidoCalculator, error) {
	var hokkaidoTrunkFares [101]PassFare
	if err := json.Unmarshal(hokkaidoTrunkFaresJSON, &hokkaidoTrunkFares); err != nil {
		return nil, fmt.Errorf("failed to unmarshal hokkaidoTrunkFares: %w", err)
	}
	var hokkaidoLocalFares [101]PassFare
	if err := json.Unmarshal(hokkaidoLocalFaresJSON, &hokkaidoLocalFares); err != nil {
		return nil, fmt.Errorf("failed to unmarshal hokkaidoLocalFares: %w", err)
	}
	return &HokkaidoCalculator{trunkFares: hokkaidoTrunkFares, localFares: hokkaidoLocalFares}, nil
}

type HokkaidoCalculator struct {
	trunkFares [101]PassFare
	localFares [101]PassFare
}

func (c *HokkaidoCalculator) Calculate(params PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
