package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"errors"
	"fmt"
	"slices"
)

// PricedRouteTicketFare は運賃ページ専用。分割計算のレスポンスは変更しない。
type PricedRouteTicketFare struct {
	RouteTicketFare
	DiscountApplied    bool           `json:"discountApplied"`
	InputDistances     RouteDistances `json:"inputDistances"`
	CorrectedDistances RouteDistances `json:"correctedDistances"`
}

type pricedRouteCandidate struct {
	fare   PricedRouteTicketFare
	result *CalculationResult
}

// CalculateWithPricing は延長前の入力を保持し、延長した各候補全体に通常の
// 補正・特例を適用する。候補比較時の券面と金額をそのまま返す。
func (c *RouteTicketCalculator) CalculateWithPricing(path []int, steps []ViaStep, mode string, options TicketPricingOptions, singleStation ...SingleStationOptions) (PricedRouteTicketFare, error) {
	options, err := options.Normalize()
	if err != nil {
		return PricedRouteTicketFare{}, err
	}
	inputSummary, err := c.evaluator.calculation.calc.analyzePath(path)
	if err != nil {
		return PricedRouteTicketFare{}, err
	}
	local := *c
	local.corrector = pricingCorrector(c.corrector, func(p []int) (int, error) {
		base, _, e := c.evaluator.ExecuteWithOptions(p, 0, "normal", singleStationOptions(singleStation))
		if e != nil {
			return 0, e
		}
		return options.price(base).TotalAmount(), nil
	})
	evalMode := mode
	if mode == "cheapest" {
		evalMode = "normal"
	}
	cache := map[string]*pricedRouteCandidate{}
	failures := map[string]error{}
	evaluate := func(p []int) (*pricedRouteCandidate, error) {
		key := extensionPathKey(p)
		if failure, ok := failures[key]; ok {
			return nil, failure
		}
		if value, ok := cache[key]; ok {
			return value, nil
		}
		fare, base, err := local.calculatePresented(p, steps, evalMode, mode, false, singleStation...)
		if err != nil {
			failures[key] = err
			return nil, err
		}
		// 市内駅などを展開した後にも、新幹線と在来線の重複を検査する。
		if mode == "cheapest" {
			physical, _ := local.evaluator.calculation.calc.buildFarePaths(base.FinalPath)
			if err := local.validateInputPath(physical); err != nil {
				failures[key] = err
				return nil, err
			}
		}
		priced := options.price(base)
		fare.Fare = priced.TotalAmount()
		value := &pricedRouteCandidate{PricedRouteTicketFare{RouteTicketFare: fare, DiscountApplied: priced.DiscountApplied, InputDistances: inputSummary.distances(), CorrectedDistances: base.Distances}, priced}
		cache[key] = value
		return value, nil
	}
	best, err := evaluate(path)
	if err != nil {
		return PricedRouteTicketFare{}, err
	}
	if mode != "cheapest" {
		return best.fare, nil
	}
	// 途中下車できない近郊区間内完結の乗車券は延長しない。
	if IsSuburbanAreaComplete(path, c.graph) {
		return best.fare, nil
	}
	consider := func(candidate *pricedRouteCandidate) {
		// 同額では先に評価した経路を維持する。
		if candidate != nil && candidate.fare.Fare < best.fare.Fare {
			best = candidate
		}
	}
	discount := options.discount()
	if discount != nil && discount.MinEigyoKilo == 1000 && best.result.TotalEigyoKilo < 1000 {
		// 両側とも元の入力経路を基準にする。着側の採用経路をさらに発側へ延ばさない。
		for _, direction := range []extensionDirection{extendDestination, extendOrigin} {
			candidate, err := firstPricingExtension(path, c.graph, direction, discount.MinEigyoKilo, local.canRepairExtensionDuplicate, evaluate)
			if err != nil {
				return PricedRouteTicketFare{}, err
			}
			consider(candidate)
		}
	} else {
		// その他は既存の114条候補生成を利用する。割引後の運賃で比較し、
		// 各候補はevaluateで全経路を再補正・検証する。
		selected, _, err := SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath(path, c.graph, cheapestPathCorrector(local.corrector), c.extensions, c.zones, func(p []int) (int, error) {
			candidate, err := evaluate(p)
			if err != nil {
				return 0, err
			}
			consider(candidate)
			return candidate.fare.Fare, nil
		})
		if err != nil {
			return PricedRouteTicketFare{}, err
		}
		if candidate, err := evaluate(selected); err == nil {
			consider(candidate)
		}
	}
	return best.fare, nil
}

// pricingCorrector は共有パイプラインを変更せず、近郊区間の比較にも利用者の
// 運賃を使う。その他の補正器は読み取り専用で共有できる。
func pricingCorrector(corrector PathCorrector, evaluate func([]int) (int, error)) PathCorrector {
	switch value := corrector.(type) {
	case *PipelineCorrector:
		children := make([]PathCorrector, len(value.correctors))
		for i, child := range value.correctors {
			children[i] = pricingCorrector(child, evaluate)
		}
		return NewPipelineCorrector(children...)
	case *SuburbanAreaCorrector:
		return &SuburbanAreaCorrector{fareEval: evaluate, evaluateWholeRoute: true}
	default:
		return corrector
	}
}

// 過大な探索を正常終了として返さない。
const maxPricingExtensionStates = 100000

// firstPricingExtension は片側だけを延長し、補正後に閾値を初めて超えた
// 発売可能な1候補を返す。駅ID順の幅優先で同じ入力に対する結果を固定する。
func firstPricingExtension(input []int, g graph.Graph, direction extensionDirection, threshold domain.DeciKilo, canRepair func([]int) bool, evaluate func([]int) (*pricedRouteCandidate, error)) (*pricedRouteCandidate, error) {
	physical := physicalGraphForExtensions(g)
	queue := [][]int{slices.Clone(input)}
	seen := map[string]struct{}{}
	for index := 0; index < len(queue); index++ {
		path := queue[index]
		queue[index] = nil
		key := extensionPathKey(path)
		if _, exists := seen[key]; exists {
			continue
		}
		if len(seen) >= maxPricingExtensionStates {
			return nil, fmt.Errorf("延長経路の探索量が上限を超えました。通常モードで計算するか経路を指定し直してください")
		}
		seen[key] = struct{}{}
		if len(path) > len(input) {
			candidate, err := evaluate(path)
			if err == nil && candidate != nil && candidate.result.TotalEigyoKilo > threshold {
				return candidate, nil
			}
			if errors.Is(err, domain.ErrDuplicateRoute) && (canRepair == nil || !canRepair(path)) {
				continue
			}
		}
		endpoint := path[0]
		if direction == extendDestination {
			endpoint = path[len(path)-1]
		}
		var neighbors []int
		for _, edge := range physical.GetEdges(endpoint) {
			neighbors = append(neighbors, edge.ToID)
		}
		slices.Sort(neighbors)
		neighbors = slices.Compact(neighbors)
		for _, nextID := range neighbors {
			next := make([]int, 0, len(path)+1)
			if direction == extendOrigin {
				next = append(next, nextID)
				next = append(next, path...)
			} else {
				next = append(next, path...)
				next = append(next, nextID)
			}
			if domain.HasDuplicateStation(next) && (canRepair == nil || !canRepair(next)) {
				continue
			}
			queue = append(queue, next)
		}
	}
	return nil, nil
}

// 重複控除は経路端では成立せず、その先の1駅で成立する場合がある。
// その中間状態だけは探索を継続する。同じ物理駅を3回通る延長は生成しない。
func (c *RouteTicketCalculator) canRepairExtensionDuplicate(path []int) bool {
	counts := map[int]int{}
	for _, station := range path {
		counts[station]++
		if counts[station] > 2 {
			return false
		}
	}
	if c.validateInputPath(path) == nil {
		return true
	}
	physical := physicalGraphForExtensions(c.graph)
	for _, direction := range []extensionDirection{extendOrigin, extendDestination} {
		endpoint := path[0]
		if direction == extendDestination {
			endpoint = path[len(path)-1]
		}
		for _, edge := range physical.GetEdges(endpoint) {
			if counts[edge.ToID] >= 2 {
				continue
			}
			var next []int
			if direction == extendOrigin {
				next = append([]int{edge.ToID}, path...)
			} else {
				next = append(slices.Clone(path), edge.ToID)
			}
			if c.validateInputPath(next) == nil {
				return true
			}
		}
	}
	return false
}
