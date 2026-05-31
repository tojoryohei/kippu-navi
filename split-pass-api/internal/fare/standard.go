package fare

import (
	"split-pass-api/internal/domain"
)

func NewStandardCalculator(trunkFares, localFares [101]domain.PassPrice) *StandardCalculator {
	return &StandardCalculator{trunkFares: trunkFares, localFares: localFares}
}

type StandardCalculator struct {
	trunkFares [101]domain.PassPrice
	localFares [101]domain.PassPrice
}

func (c *StandardCalculator) Calculate(params domain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
