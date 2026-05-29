package fare

import (
	"split-pass-api/internal/domain"
)

func NewStandardCalculator(trunkFares, localFares [101]domain.PassFare) *StandardCalculator {
	return &StandardCalculator{trunkFares: trunkFares, localFares: localFares}
}

type StandardCalculator struct {
	trunkFares [101]domain.PassFare
	localFares [101]domain.PassFare
}

func (c *StandardCalculator) Calculate(params domain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
