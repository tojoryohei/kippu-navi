package fare

import (
	passdomain "calculation-engine/internal/pass/domain"
)

func NewStandardCalculator(trunkFares, localFares [101]passdomain.PassPrice) *StandardCalculator {
	return &StandardCalculator{trunkFares: trunkFares, localFares: localFares}
}

type StandardCalculator struct {
	trunkFares [101]passdomain.PassPrice
	localFares [101]passdomain.PassPrice
}

func (c *StandardCalculator) Calculate(params passdomain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
