package usecase

// PricedRouteTicketFare は運賃ページ専用。分割計算のレスポンスは変更しない。
type PricedRouteTicketFare struct {
	RouteTicketFare
	DiscountApplied    bool           `json:"discountApplied"`
	InputDistances     RouteDistances `json:"inputDistances"`
	CorrectedDistances RouteDistances `json:"correctedDistances"`
}

// CalculateWithPricing は既存の経路補正・延長候補を利用者の支払額で比較する。
// 候補全体に通常の補正・特例を適用し、評価した券面と金額をそのまま返す。
func (c *RouteTicketCalculator) CalculateWithPricing(path []int, steps []ViaStep, mode string, options TicketPricingOptions) (PricedRouteTicketFare, error) {
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
		base, _, e := c.evaluator.ExecuteWithMode(p, 0, "normal")
		if e != nil {
			return 0, e
		}
		return options.price(base).TotalAmount(), nil
	})
	evalMode := mode
	if mode == "cheapest" {
		evalMode = "normal"
	}
	cache := map[string]*PricedRouteTicketFare{}
	failures := map[string]error{}
	evaluate := func(p []int) (*PricedRouteTicketFare, error) {
		key := extensionPathKey(p)
		if failure, ok := failures[key]; ok {
			return nil, failure
		}
		if value, ok := cache[key]; ok {
			return value, nil
		}
		fare, base, err := local.calculatePresented(p, steps, evalMode, mode, false)
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
		value := &PricedRouteTicketFare{RouteTicketFare: fare, DiscountApplied: priced.DiscountApplied, InputDistances: inputSummary.distances(), CorrectedDistances: base.Distances}
		cache[key] = value
		return value, nil
	}
	best, err := evaluate(path)
	if err != nil {
		return PricedRouteTicketFare{}, err
	}
	if mode != "cheapest" {
		return *best, nil
	}
	// 途中下車できない近郊区間内完結の乗車券は延長しない。
	if IsSuburbanAreaComplete(path, c.graph) {
		return *best, nil
	}
	consider := func(candidate *PricedRouteTicketFare) {
		// 同額では先に評価した経路を維持する。
		if candidate != nil && candidate.Fare < best.Fare {
			best = candidate
		}
	}
	// 既存の114条候補生成を利用する。割引後の運賃で比較し、
	// 各候補はevaluateで全経路を再補正・検証する。
	selected, _, err := SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath(path, c.graph, cheapestPathCorrector(local.corrector), c.extensions, c.zones, func(p []int) (int, error) {
		candidate, err := evaluate(p)
		if err != nil {
			return 0, err
		}
		consider(candidate)
		return candidate.Fare, nil
	})
	if err != nil {
		return PricedRouteTicketFare{}, err
	}
	if candidate, err := evaluate(selected); err == nil {
		consider(candidate)
	}
	return *best, nil
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
