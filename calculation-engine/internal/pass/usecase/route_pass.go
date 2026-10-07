package usecase

import (
	"calculation-engine/internal/domain"
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"calculation-engine/internal/split"
	"fmt"
	"math"
)

type RoutePassEvaluator interface {
	Execute([]int, int) (*CalculationResult, error)
}

// RoutePassCalculator は、運賃計算ページと経路指定の分割検索で共用する定期券計算器です。
type RoutePassCalculator struct {
	graph     graph.Graph
	evaluator RoutePassEvaluator
	rules     []passdomain.ResolvedBypassRule
}

func NewRoutePassCalculator(g graph.Graph, evaluator RoutePassEvaluator, rules []passdomain.ResolvedBypassRule) *RoutePassCalculator {
	return &RoutePassCalculator{g, evaluator, rules}
}

type RoutePassFare struct {
	Fare            int      `json:"fare"`
	BarrierFreeFee  int      `json:"barrierFreeFee"`
	Charge          int      `json:"charge"`
	TotalEigyoKilo  int      `json:"totalEigyoKilo"`
	PrintedViaLines []string `json:"printedViaLines"`
	CorrectedPath   []string `json:"correctedPath"`
}

func (f RoutePassFare) summary() split.RouteFare {
	return split.RouteFare{DepartureStation: f.CorrectedPath[0], ArrivalStation: f.CorrectedPath[len(f.CorrectedPath)-1], Fare: f.Fare + f.BarrierFreeFee + f.Charge, TotalEigyoKilo: f.TotalEigyoKilo, PrintedViaLines: f.PrintedViaLines}
}
func (c *RoutePassCalculator) ResolvePath(names []string) ([]int, error) {
	if len(names) < 2 || len(names) >= 3000 {
		return nil, domain.ErrInvalidPath
	}
	path := make([]int, len(names))
	for i, name := range names {
		id, ok := c.graph.GetID(name)
		if !ok {
			return nil, fmt.Errorf("%w: %s", domain.ErrStationNotFound, name)
		}
		path[i] = id
	}
	if domain.HasDuplicateStation(path) {
		return nil, domain.ErrDuplicateRoute
	}
	return path, nil
}
func (c *RoutePassCalculator) Calculate(path []int, months int, mode string) (RoutePassFare, error) {
	var fare RoutePassFare
	if len(path) < 2 {
		return fare, domain.ErrInvalidPath
	}
	if months != 1 && months != 3 && months != 6 {
		return fare, domain.ErrInvalidMonths
	}
	if c.evaluator == nil {
		return fare, fmt.Errorf("定期券運賃評価器が未設定です")
	}
	finalPath := path
	if mode != "uncorrect" {
		finalPath = c.CorrectPath(path)
	}
	if mode == "cheapest" {
		minimum := math.MaxInt
		for _, candidate := range c.cheapestCandidates(path) {
			if !validRoutePassCandidate(candidate) {
				continue
			}
			res, err := c.evaluator.Execute(candidate, months)
			if err != nil {
				continue
			} // 候補を評価できない場合は、既存の運賃計算ページと同じ代替処理を使います。
			if res == nil {
				continue
			}
			if res.TotalAmount() < minimum {
				minimum = res.TotalAmount()
				finalPath = candidate
			}
		}
	}
	if len(finalPath) < 2 {
		return fare, domain.ErrInvalidPath
	}
	res, err := c.evaluator.Execute(finalPath, months)
	if err != nil {
		return fare, err
	}
	if res == nil {
		return fare, fmt.Errorf("定期券運賃計算結果が空です")
	}
	names := make([]string, len(finalPath))
	for i, id := range finalPath {
		names[i] = c.graph.GetName(id)
	}
	via := GetVia(c.graph, finalPath)
	if via == nil {
		via = []string{}
	}
	return RoutePassFare{res.Fare, res.BarrierFreeFee, res.Charge, int(res.TotalEigyoKilo), via, names}, nil
}
func (c *RoutePassCalculator) Split(names []string, months int, mode string, options ...split.RouteSplitOptions) (*split.RouteSplitResult, error) {
	path, err := c.ResolvePath(names)
	if err != nil {
		return nil, err
	}
	normal, err := c.Calculate(path, months, mode)
	if err != nil {
		return nil, err
	}
	target, err := c.PrepareSplitPath(names, mode)
	if err != nil {
		return nil, err
	}
	opts := split.RouteSplitOptions{}
	if len(options) > 0 {
		opts = options[0]
	}
	if opts.MaxSplits < 0 || opts.MaxSplits > 10 {
		return nil, domain.ErrInvalidPath
	}
	forbidden := map[string]bool{}
	for _, name := range opts.NoSplitStations {
		forbidden[name] = true
	}
	plans, err := split.OptimizeFixedRoute(len(target), func(i, j int) (split.RouteSplitSegment, error) {
		if (i > 0 && forbidden[c.graph.GetName(target[i])]) || (j < len(target)-1 && forbidden[c.graph.GetName(target[j])]) {
			return split.RouteSplitSegment{}, domain.ErrInvalidPath
		}
		fare, err := c.Calculate(target[i:j+1], months, mode)
		if err != nil {
			return split.RouteSplitSegment{}, err
		}
		return split.RouteSplitSegment{DepartureStation: c.graph.GetName(target[i]), ArrivalStation: c.graph.GetName(target[j]), Fare: fare.summary()}, nil
	}, opts.MaxSplits)
	if err != nil {
		return nil, err
	}
	return &split.RouteSplitResult{Normal: normal.summary(), Results: plans}, nil
}

func (c *RoutePassCalculator) PrepareSplitPath(names []string, mode string) ([]int, error) {
	path, err := c.ResolvePath(names)
	if err != nil {
		return nil, err
	}
	if mode == "cheapest" {
		path = c.CorrectPath(path)
	}
	return path, nil
}
func (c *RoutePassCalculator) SplitCandidates(names []string, mode string) ([]string, error) {
	path, err := c.PrepareSplitPath(names, mode)
	if err != nil {
		return nil, err
	}
	namesOut := []string{}
	seen := map[string]bool{}
	if len(path) < 2 {
		return nil, domain.ErrInvalidPath
	}
	for _, id := range path[1 : len(path)-1] {
		name := c.graph.GetName(id)
		if !seen[name] && id != path[0] && id != path[len(path)-1] {
			namesOut = append(namesOut, name)
			seen[name] = true
		}
	}
	return namesOut, nil
}
