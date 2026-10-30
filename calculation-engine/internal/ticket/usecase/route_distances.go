package usecase

// RouteTicketFareWithDistances は運賃ページに入力経路と補正後の距離を返します。
type RouteTicketFareWithDistances struct {
	RouteTicketFare
	InputDistances     RouteDistances `json:"inputDistances"`
	CorrectedDistances RouteDistances `json:"correctedDistances"`
}

func (c *RouteTicketCalculator) CalculateWithDistances(path []int, steps []ViaStep, mode string) (RouteTicketFareWithDistances, error) {
	fare, result, err := c.Calculate(path, steps, mode)
	if err != nil {
		return RouteTicketFareWithDistances{}, err
	}
	input, err := c.evaluator.calculation.calc.analyzePath(path)
	if err != nil {
		return RouteTicketFareWithDistances{}, err
	}
	return RouteTicketFareWithDistances{fare, input.distances(), result.Distances}, nil
}
