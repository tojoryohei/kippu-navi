package fare

import (
	passdomain "calculation-engine/internal/pass/domain"
)

func NewShikokuCalculator(fares [101]passdomain.PassPrice) *ShikokuCalculator {
	return &ShikokuCalculator{fares: fares}
}

type ShikokuCalculator struct {
	fares [101]passdomain.PassPrice
}

func (c *ShikokuCalculator) Calculate(params passdomain.PassFareParams) (int, error) {
	return calculateSingleTableFare(params, &c.fares)
}
