package fare

import (
	"split-pass-api/internal/domain"
)

func NewHokkaidoCalculator(trunkFares, localFares [101]domain.PassFare) *HokkaidoCalculator {
	return &HokkaidoCalculator{trunkFares: trunkFares, localFares: localFares}
}

type HokkaidoCalculator struct {
	trunkFares [101]domain.PassFare
	localFares [101]domain.PassFare
}

func (c *HokkaidoCalculator) Calculate(params domain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
