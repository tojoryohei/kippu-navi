package fare

import (
	"split-pass-api/internal/domain"
)

func NewHokkaidoCalculator(trunkFares, localFares [101]domain.PassPrice) *HokkaidoCalculator {
	return &HokkaidoCalculator{trunkFares: trunkFares, localFares: localFares}
}

type HokkaidoCalculator struct {
	trunkFares [101]domain.PassPrice
	localFares [101]domain.PassPrice
}

func (c *HokkaidoCalculator) Calculate(params domain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
