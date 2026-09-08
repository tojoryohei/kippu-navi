package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
)

// FarePathCandidate は特例を適用した運賃計算用経路と、その適用条件を表します。
// 特例の選択はResolverが行い、実際の運賃計算はTicketCalculationUseCaseが行います。
type FarePathCandidate struct {
	Path           []int
	ThresholdKilo  domain.DeciKilo
	CheckThreshold bool
}

// SpecialFareRuleResolver は運賃計算前に適用する特例経路を、規則で定めた順に解決します。
// CalculationModeがuncorrectの場合も、第88条特例だけは適用します。
type SpecialFareRuleResolver struct {
	applier            *SpecialZoneApplier
	osakaCityCorrector PathCorrector
	postZoneCorrector  PathCorrector
	zoneRegistry       *graphio.SpecialZoneRegistry
	graph              graph.Graph
}

func NewSpecialFareRuleResolver(applier *SpecialZoneApplier, postZoneCorrector PathCorrector, reg *graphio.SpecialZoneRegistry, g graph.Graph) *SpecialFareRuleResolver {
	return &SpecialFareRuleResolver{
		applier:            applier,
		osakaCityCorrector: NewOsakaCityShinOsakaCorrector(),
		postZoneCorrector:  postZoneCorrector,
		zoneRegistry:       reg,
		graph:              g,
	}
}

// Resolve は入力経路に適用可能な候補を優先順位順に返します。
// 候補の運賃や営業キロはここでは計算しません。
func (r *SpecialFareRuleResolver) Resolve(path []int, mode string) ([]FarePathCandidate, error) {
	if len(path) < 2 {
		return nil, domain.ErrInvalidPath
	}
	if mode == "uncorrect" {
		resolved := make([]FarePathCandidate, 0, 2)
		if info, ok := ApplyOsakaShinOsakaException(path, r.graph); ok {
			resolved = append(resolved, FarePathCandidate{
				Path:           info.TransformedPath,
				ThresholdKilo:  info.ThresholdKilo,
				CheckThreshold: false,
			})
		}
		// 第88条が不成立、または運賃計算に失敗した場合は入力経路へ戻します。
		return append(resolved, FarePathCandidate{Path: path}), nil
	}

	startName := r.graph.GetName(path[0])
	endName := r.graph.GetName(path[len(path)-1])
	originZones := r.zoneRegistry.FindZonesByStation(startName)
	destZones := r.zoneRegistry.FindZonesByStation(endName)

	type zoneCandidate struct {
		origin *ticketdomain.SpecialZone
		dest   *ticketdomain.SpecialZone
	}
	var candidates []zoneCandidate

	var originCityZones, originYamanoteZones []*ticketdomain.SpecialZone
	for i := range originZones {
		if originZones[i].Name == "東京山手線内" {
			originYamanoteZones = append(originYamanoteZones, &originZones[i])
		} else {
			originCityZones = append(originCityZones, &originZones[i])
		}
	}
	var destCityZones, destYamanoteZones []*ticketdomain.SpecialZone
	for i := range destZones {
		if destZones[i].Name == "東京山手線内" {
			destYamanoteZones = append(destYamanoteZones, &destZones[i])
		} else {
			destCityZones = append(destCityZones, &destZones[i])
		}
	}

	addCandidates := func(origins, dests []*ticketdomain.SpecialZone) {
		for _, d := range dests {
			for _, o := range origins {
				candidates = append(candidates, zoneCandidate{origin: o, dest: d})
			}
			candidates = append(candidates, zoneCandidate{dest: d})
		}
		for _, o := range origins {
			candidates = append(candidates, zoneCandidate{origin: o})
		}
	}
	addCandidates(originCityZones, destCityZones)
	addCandidates(originYamanoteZones, destYamanoteZones)

	resolved := make([]FarePathCandidate, 0, len(candidates)+2)
	for _, candidate := range candidates {
		info, ok := r.applier.Apply(path, candidate.origin, candidate.dest)
		if !ok {
			continue
		}
		corrected, err := r.applyPostZoneCorrections(info.TransformedPath)
		if err != nil {
			continue
		}
		resolved = append(resolved, FarePathCandidate{
			Path:           corrected,
			ThresholdKilo:  info.ThresholdKilo,
			CheckThreshold: true,
		})
	}

	// 第88条の直前に、大阪市内→大阪→新神戸の接続補正を適用します。
	// この順序により、通常・最安モードでは大阪市内の出口駅を大阪駅として
	// 評価した経路を第88条候補へ渡せます。
	osakaInput, err := r.applyOsakaCityCorrection(path)
	if err == nil {
		if info, ok := ApplyOsakaShinOsakaException(osakaInput, r.graph); ok {
			corrected, err := r.applyPostZoneCleanup(info.TransformedPath)
			if err == nil {
				resolved = append(resolved, FarePathCandidate{
					Path:           corrected,
					ThresholdKilo:  info.ThresholdKilo,
					CheckThreshold: false,
				})
			}
		}
	}

	// すべての特例が不成立の場合に元の経路を評価する候補を必ず最後に追加します。
	corrected, err := r.applyPostZoneCorrections(path)
	if err != nil {
		return nil, err
	}
	resolved = append(resolved, FarePathCandidate{Path: corrected})
	return resolved, nil
}

func (r *SpecialFareRuleResolver) applyPostZoneCorrections(path []int) ([]int, error) {
	corrected, err := r.applyOsakaCityCorrection(path)
	if err != nil {
		return nil, err
	}
	return r.applyPostZoneCleanup(corrected)
}

func (r *SpecialFareRuleResolver) applyOsakaCityCorrection(path []int) ([]int, error) {
	corrector := r.osakaCityCorrector
	if corrector == nil {
		corrector = NewOsakaCityShinOsakaCorrector()
	}
	return corrector.Correct(path, r.graph)
}

func (r *SpecialFareRuleResolver) applyPostZoneCleanup(path []int) ([]int, error) {
	if r.postZoneCorrector != nil {
		return r.postZoneCorrector.Correct(path, r.graph)
	}
	return path, nil
}
