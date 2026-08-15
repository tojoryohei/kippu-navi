package fare

import (
	passdomain "calculation-engine/internal/pass/domain"
)

func NewEastCalculator(trunkFares, localFares [101]passdomain.PassPrice) *EastCalculator {
	return &EastCalculator{trunkFares: trunkFares, localFares: localFares}
}

type EastCalculator struct {
	trunkFares [101]passdomain.PassPrice
	localFares [101]passdomain.PassPrice
}

func (c *EastCalculator) Calculate(params passdomain.PassFareParams) (int, error) {
	return calculateBaseFare(params, &c.trunkFares, &c.localFares)
}
