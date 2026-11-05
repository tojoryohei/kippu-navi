package usecase

import "calculation-engine/internal/domain"

type CompanyDistance struct {
	EigyoKilo domain.DeciKilo `json:"eigyoKilo"`
	GiseiKilo domain.DeciKilo `json:"giseiKilo"`
}

type RouteDistances [domain.CompanyCount]CompanyDistance

// RoutePassFareWithDistances は定期券の運賃ページに補正前後の距離を返します。
type RoutePassFareWithDistances struct {
	RoutePassFare
	InputDistances     RouteDistances `json:"inputDistances"`
	CorrectedDistances RouteDistances `json:"correctedDistances"`
}

func (c *RoutePassCalculator) CalculateWithDistances(path []int, months int, mode string) (RoutePassFareWithDistances, error) {
	fare, err := c.Calculate(path, months, mode)
	if err != nil {
		return RoutePassFareWithDistances{}, err
	}
	correctedPath, err := c.ResolvePath(fare.CorrectedPath)
	if err != nil {
		return RoutePassFareWithDistances{}, err
	}
	// 距離は運賃の再評価をせず、採用された経路のエッジから集計します。
	analyzer := CalculateAmount{graph: c.graph}
	input, err := analyzer.analyzePath(path)
	if err != nil {
		return RoutePassFareWithDistances{}, err
	}
	corrected, err := analyzer.analyzePath(correctedPath)
	if err != nil {
		return RoutePassFareWithDistances{}, err
	}
	return RoutePassFareWithDistances{fare, input.distances(), corrected.distances()}, nil
}

func (s *routeSummary) distances() (result RouteDistances) {
	for i, stats := range s.statsByCompany {
		result[i] = CompanyDistance{stats.eigyo, stats.gisei}
	}
	return
}
