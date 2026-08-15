package fare

import (
	passdomain "calculation-engine/internal/pass/domain"
)

func NewHokkaidoCalculator(trunkFares, localFares [101]passdomain.PassPrice) *HokkaidoCalculator {
	return &HokkaidoCalculator{trunkFares: trunkFares, localFares: localFares}
}

type HokkaidoCalculator struct {
	trunkFares [101]passdomain.PassPrice
	localFares [101]passdomain.PassPrice
}

func (c *HokkaidoCalculator) Calculate(params passdomain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
