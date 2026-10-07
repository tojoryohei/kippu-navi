package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/split"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"fmt"
)

// RouteTicketCalculator は、運賃計算ページと経路指定分割で乗車券の計算を共用します。
// 分割候補の準備時には、最安モードの経路延長を行いません。
type RouteTicketCalculator struct {
	graph              graph.Graph
	corrector          PathCorrector
	evaluator          *TicketSegmentEvaluator
	extensions         *RouteExtensionMatcher
	zones              *graphio.SpecialZoneRegistry
	inputPathCorrector PathCorrector
}

func NewRouteTicketCalculator(g graph.Graph, c PathCorrector, e *TicketSegmentEvaluator, extensions *RouteExtensionMatcher, zones *graphio.SpecialZoneRegistry) *RouteTicketCalculator {
	return &RouteTicketCalculator{g, c, e, extensions, zones, newInputPathCorrector()}
}

// RouteCorrectionError は、経路補正のエラーを呼び出し元で識別できるよう保持します。
type RouteCorrectionError struct{ Err error }

func (e *RouteCorrectionError) Error() string { return e.Err.Error() }
func (e *RouteCorrectionError) Unwrap() error { return e.Err }

type RouteTicketFare = split.RouteFare

func (c *RouteTicketCalculator) ResolvePath(steps []ViaStep) ([]int, error) {
	if len(steps) < 2 || len(steps) >= 3000 {
		return nil, domain.ErrInvalidPath
	}
	path := make([]int, len(steps))
	for i, step := range steps {
		id, ok := c.graph.GetID(step.StationName)
		if !ok {
			return nil, fmt.Errorf("%w: %s", domain.ErrStationNotFound, step.StationName)
		}
		path[i] = id
	}
	if err := c.validateInputPath(path); err != nil {
		return nil, err
	}
	return path, nil
}

// Calculate は、運賃計算ページで使う乗車券情報と計算結果を返します。
func (c *RouteTicketCalculator) Calculate(path []int, steps []ViaStep, mode string) (RouteTicketFare, *CalculationResult, error) {
	return c.calculate(path, steps, mode, true)
}

func (c *RouteTicketCalculator) calculate(path []int, steps []ViaStep, mode string, logKanaCodes bool) (RouteTicketFare, *CalculationResult, error) {
	var fare RouteTicketFare
	if len(path) < 2 {
		return fare, nil, domain.ErrInvalidPath
	}
	if err := c.validateInputPath(path); err != nil {
		return fare, nil, err
	}
	if c.evaluator == nil {
		return fare, nil, fmt.Errorf("乗車券運賃評価器が未設定です")
	}
	var corrected, suburban []int
	evaluationMode := NormalizeFareEvaluationMode(mode)
	var err error
	if mode == "cheapest" {
		corrected, suburban, err = SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath(path, c.graph, c.corrector, c.extensions, c.zones, func(candidate []int) (int, error) {
			res, _, err := c.evaluator.ExecuteWithMode(candidate, 0, "normal")
			if err != nil {
				return 0, err
			}
			if res == nil {
				return 0, fmt.Errorf("乗車券運賃計算結果が空です")
			}
			return res.TotalAmount(), nil
		})
	} else {
		corrected, evaluationMode, suburban, err = CorrectPathForModeWithRouteExtensionsAndPreShinkansenPath(path, c.graph, c.corrector, c.extensions, mode)
	}
	if err != nil {
		return fare, nil, &RouteCorrectionError{Err: err}
	}
	res, transformed, err := c.evaluator.ExecuteWithMode(corrected, 0, evaluationMode)
	if err != nil {
		return fare, nil, err
	}
	if res == nil || len(res.FinalPath) < 2 {
		return fare, nil, fmt.Errorf("乗車券運賃計算結果の経路が不正です")
	}
	via := GetCalculatedFareVia(mode, steps, path, transformed, res.FinalPath, c.graph, c.zones)
	if logKanaCodes {
		logCalculatedFareViaKanas(mode, steps, path, transformed, c.graph)
	}
	if via == nil {
		via = []string{}
	}
	fare = RouteTicketFare{
		TotalEigyoKilo:   int(res.TotalPathEigyoKilo),
		DepartureStation: c.graph.GetName(res.FinalPath[0]),
		ArrivalStation:   c.graph.GetName(res.FinalPath[len(res.FinalPath)-1]),
		PrintedViaLines:  via,
		Fare:             res.TotalAmount(),
		ValidDays:        CalculateTicketValidDays(res.TotalPathEigyoKilo, suburban, c.graph),
	}
	return fare, res, nil
}

type RouteSplitSegment = split.RouteSplitSegment
type RouteSplitResult = split.RouteSplitResult

func (c *RouteTicketCalculator) Split(steps []ViaStep, mode string, options ...split.RouteSplitOptions) (*RouteSplitResult, error) {
	path, err := c.ResolvePath(steps)
	if err != nil {
		return nil, err
	}
	normal, _, err := c.calculate(path, steps, mode, false)
	if err != nil {
		return nil, err
	}
	target, replacements, err := c.prepareSplitPath(steps, mode)
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
	plans, err := split.OptimizeFixedRouteWithProgress(len(target), func(i, j int) (RouteSplitSegment, error) {
		if (i > 0 && forbidden[c.graph.GetName(target[i])]) || (j < len(target)-1 && forbidden[c.graph.GetName(target[j])]) {
			return RouteSplitSegment{}, domain.ErrInvalidPath
		}
		var via []ViaStep
		if mode != "cheapest" {
			via = append([]ViaStep(nil), steps[i:j+1]...)
			via[len(via)-1].LineName = ""
		}
		fare, _, err := c.calculate(target[i:j+1], via, mode, false)
		return RouteSplitSegment{DepartureStation: c.graph.GetName(target[i]), ArrivalStation: c.graph.GetName(target[j]), Fare: fare}, err
	}, opts.Progress, opts.MaxSplits)
	if err != nil {
		return nil, err
	}
	return &RouteSplitResult{Normal: normal, Results: plans, Replacements: replacements}, nil
}

func (c *RouteTicketCalculator) PrepareSplitPath(steps []ViaStep, mode string) ([]int, error) {
	path, _, err := c.prepareSplitPath(steps, mode)
	return path, err
}
func (c *RouteTicketCalculator) prepareSplitPath(steps []ViaStep, mode string) ([]int, []split.RouteReplacement, error) {
	path, err := c.ResolvePath(steps)
	if err != nil {
		return nil, nil, err
	}
	if mode == "cheapest" {
		return c.prepareConventionalSplit(steps, path)
	}
	return path, nil, nil
}
func (c *RouteTicketCalculator) SplitCandidates(steps []ViaStep, mode string) ([]string, error) {
	result, err := c.SplitCandidateDetails(steps, mode)
	if err != nil {
		return nil, err
	}
	return result.Names, nil
}
func (c *RouteTicketCalculator) SplitCandidateDetails(steps []ViaStep, mode string) (*split.RouteSplitCandidates, error) {
	path, replacements, err := c.prepareSplitPath(steps, mode)
	if err != nil {
		return nil, err
	}
	if len(path) < 2 {
		return nil, domain.ErrInvalidPath
	}
	names := []string{}
	seen := map[string]bool{}
	for _, id := range path[1 : len(path)-1] {
		name := c.graph.GetName(id)
		if !seen[name] && id != path[0] && id != path[len(path)-1] {
			names = append(names, name)
			seen[name] = true
		}
	}
	return &split.RouteSplitCandidates{Names: names, Replacements: replacements}, nil
}
