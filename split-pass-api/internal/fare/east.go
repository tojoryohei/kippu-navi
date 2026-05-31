package fare

import (
	"split-pass-api/internal/domain"
)

func NewEastCalculator(trunkFares, localFares [101]domain.PassPrice) *EastCalculator {
	return &EastCalculator{trunkFares: trunkFares, localFares: localFares}
}

type EastCalculator struct {
	trunkFares [101]domain.PassPrice
	localFares [101]domain.PassPrice
}

func (c *EastCalculator) Calculate(params domain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
