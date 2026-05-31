package fare

import (
	"split-pass-api/internal/domain"
)

func NewShikokuCalculator(fares [101]domain.PassPrice) *ShikokuCalculator {
	return &ShikokuCalculator{fares: fares}
}

type ShikokuCalculator struct {
	fares [101]domain.PassPrice
}

func (c *ShikokuCalculator) Calculate(params domain.PassFareParams) (int, error) {
	return calculateSingleTableFare(params, &c.fares)
}
