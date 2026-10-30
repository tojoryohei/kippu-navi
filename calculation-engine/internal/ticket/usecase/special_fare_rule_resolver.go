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
	Path                             []int
	ThresholdKilo                    domain.DeciKilo
	CheckThreshold                   bool
	AllowOsakaZoneDistanceAdjustment bool
}

// SpecialFareRuleResolver は運賃計算前に適用する特例経路を、モードごとの順序で解決します。
type SpecialFareRuleResolver struct {
	applier           *SpecialZoneApplier
	postZoneCorrector PathCorrector
	zoneRegistry      *graphio.SpecialZoneRegistry
	graph             graph.Graph
}

type zoneCandidate struct {
	origin *ticketdomain.SpecialZone
	dest   *ticketdomain.SpecialZone
}

func NewSpecialFareRuleResolver(applier *SpecialZoneApplier, postZoneCorrector PathCorrector, reg *graphio.SpecialZoneRegistry, g graph.Graph) *SpecialFareRuleResolver {
	return &SpecialFareRuleResolver{
		applier:           applier,
		postZoneCorrector: postZoneCorrector,
		zoneRegistry:      reg,
		graph:             g,
	}
}

// Resolve は入力経路に適用可能な候補を優先順位順に返します。
// 候補の運賃や営業キロはここでは計算しません。
//
// モードごとの適用順は次のとおりです。
//
//   - 通常: 特定都区市内・東京山手線内 → 第88条 → 事後補正 → 元経路
//   - 補正禁止: 特定都区市内・東京山手線内 → 第88条 → 元経路
//
// 第69条・第70条などの経路補正は、Resolverへ渡される前に
// CorrectPathForModeで適用されます。補正禁止ではその経路補正を行わず、
// 運賃計算上必要な第86条・第87条・第88条だけをここで適用します。
func (r *SpecialFareRuleResolver) Resolve(path []int, mode string, options ...SingleStationOptions) ([]FarePathCandidate, error) {
	if len(path) < 2 {
		return nil, domain.ErrInvalidPath
	}

	opts := singleStationOptions(options)
	switch mode {
	case "uncorrect":
		return r.resolveUncorrect(path, opts), nil
	case "normal":
		fallthrough
	default:
		return r.resolveNormal(path, opts)
	}
}

// resolveNormal は通常モードの特例候補を、指定された順序で解決します。
// 経路補正本体（第69条・第70条など）は呼び出し側で既に適用されています。
func (r *SpecialFareRuleResolver) resolveNormal(path []int, opts SingleStationOptions) ([]FarePathCandidate, error) {
	// 1. 特定都区市内・東京山手線内（第86条・第87条）を適用します。
	var resolved []FarePathCandidate
	if areaID, ok := pureJRSuburbanArea(path, r.graph); ok {
		// 純粋なJR近郊区間内完結経路は、キャッシュ生成と同じく中心駅までの
		// 最短擬制キロ経路を使った片側適用だけを候補にします。
		resolved = r.applySuburbanZoneCandidate(path, areaID, opts)
	} else {
		// 私鉄を含む経路などは、従来の経路全体に対する特例判定を維持します。
		resolved = r.applyNormalZoneCandidates(path, opts)
	}

	// 第88条特例の候補と、不適用時の経路を追加します。
	osakaCandidates, err := r.applyArticle88Candidates(path, opts)
	if err != nil {
		return nil, err
	}
	return append(resolved, osakaCandidates...), nil
}

// applySuburbanZoneCandidate は純粋なJR近郊区間内完結経路の片側ゾーン候補を返します。
// 中心駅までの距離で適用可否を事前に判定するため、通常の閾値再判定は行いません。
func (r *SpecialFareRuleResolver) applySuburbanZoneCandidate(path []int, areaID domain.SuburbanAreaID, opts SingleStationOptions) []FarePathCandidate {
	if r.applier == nil {
		return nil
	}
	info, ok := r.applier.applySuburban(path, areaID, opts)
	if !ok {
		return nil
	}
	corrected, err := r.applyPostZoneCleanup(info.TransformedPath)
	if err != nil {
		return nil
	}
	return []FarePathCandidate{{
		Path:                             corrected,
		ThresholdKilo:                    info.ThresholdKilo,
		CheckThreshold:                   false,
		AllowOsakaZoneDistanceAdjustment: true,
	}}
}

// resolveUncorrect は補正禁止モードの特例候補を、指定された順序で解決します。
// 補正禁止でも第86条・第87条・第88条は運賃計算上の特例として適用します。
// 第69条・第70条などの一般的な経路補正と、大阪発着ゾーンの距離控除は適用しません。
func (r *SpecialFareRuleResolver) resolveUncorrect(path []int, opts SingleStationOptions) []FarePathCandidate {
	// 1. 特定都区市内・東京山手線内（第86条・第87条）
	resolved := r.applyUncorrectZoneCandidates(path, opts)

	// 2. 大阪・新大阪特例（第88条）の候補と入力経路を平坦な配列で追加します。
	return append(resolved, applyArticle88UncorrectCandidates(path, r.graph, opts)...)
}

func (r *SpecialFareRuleResolver) zoneCandidates(path []int, opts SingleStationOptions) []zoneCandidate {
	startName := r.graph.GetName(path[0])
	endName := r.graph.GetName(path[len(path)-1])
	originZones := r.zoneRegistry.FindZonesByStation(startName)
	destZones := r.zoneRegistry.FindZonesByStation(endName)
	if opts.DepartureSingleStation {
		originZones = nil
	}
	if opts.ArrivalSingleStation {
		destZones = nil
	}

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

	var candidates []zoneCandidate
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
	return candidates
}

// applyNormalZoneCandidates は第86条・第87条の候補を平坦な配列で返します。
// 特例が不成立、または候補経路の事後補正に失敗した場合は、その候補だけを返しません。
func (r *SpecialFareRuleResolver) applyNormalZoneCandidates(path []int, opts SingleStationOptions) []FarePathCandidate {
	if r.applier == nil || r.zoneRegistry == nil {
		return nil
	}

	resolved := make([]FarePathCandidate, 0, 2)
	for _, candidate := range r.zoneCandidates(path, opts) {
		info, ok := r.applier.Apply(path, candidate.origin, candidate.dest)
		if !ok {
			continue
		}
		corrected, err := r.applyPostZoneCleanup(info.TransformedPath)
		if err != nil {
			continue
		}
		resolved = append(resolved, FarePathCandidate{
			Path:                             corrected,
			ThresholdKilo:                    info.ThresholdKilo,
			CheckThreshold:                   true,
			AllowOsakaZoneDistanceAdjustment: true,
		})
	}
	return resolved
}

// applyUncorrectZoneCandidates は補正禁止モードの第86条・第87条候補を平坦な配列で返します。
func (r *SpecialFareRuleResolver) applyUncorrectZoneCandidates(path []int, opts SingleStationOptions) []FarePathCandidate {
	if r.applier == nil || r.zoneRegistry == nil {
		return nil
	}

	resolved := make([]FarePathCandidate, 0, 2)
	for _, candidate := range r.zoneCandidates(path, opts) {
		info, ok := r.applier.ApplyUncorrect(path, candidate.origin, candidate.dest)
		if !ok {
			continue
		}
		resolved = append(resolved, FarePathCandidate{
			Path:           info.TransformedPath,
			ThresholdKilo:  info.ThresholdKilo,
			CheckThreshold: true,
		})
	}
	return resolved
}

// applyArticle88Candidates は第88条の適用結果と不適用時の経路を平坦な配列で返します。
// 適用可否を呼び出し側の入れ子で表現せず、候補順（適用経路→フォールバック経路）を
// この関数の戻り値で表現します。
func (r *SpecialFareRuleResolver) applyArticle88Candidates(path []int, opts SingleStationOptions) ([]FarePathCandidate, error) {
	fallback, err := r.applyPostZoneCleanup(path)
	if err != nil {
		return nil, err
	}

	info, ok := ApplyOsakaShinOsakaException(path, r.graph, opts)
	if !ok {
		return []FarePathCandidate{{Path: fallback}}, nil
	}

	corrected, err := r.applyPostZoneCleanup(info.TransformedPath)
	if err != nil {
		return []FarePathCandidate{{Path: fallback}}, nil
	}
	return []FarePathCandidate{
		{
			Path:                             corrected,
			ThresholdKilo:                    info.ThresholdKilo,
			CheckThreshold:                   false,
			AllowOsakaZoneDistanceAdjustment: true,
		},
		{Path: fallback},
	}, nil
}

// applyArticle88UncorrectCandidates は補正禁止モードの第88条候補と入力経路を返します。
func applyArticle88UncorrectCandidates(path []int, g graph.Graph, opts SingleStationOptions) []FarePathCandidate {
	info, ok := ApplyOsakaShinOsakaException(path, g, opts)
	if !ok {
		return []FarePathCandidate{{Path: path}}
	}
	return []FarePathCandidate{
		{
			Path:           info.TransformedPath,
			ThresholdKilo:  info.ThresholdKilo,
			CheckThreshold: false,
		},
		{Path: path},
	}
}

func (r *SpecialFareRuleResolver) applyPostZoneCleanup(path []int) ([]int, error) {
	if r.postZoneCorrector != nil {
		return r.postZoneCorrector.Correct(path, r.graph)
	}
	return path, nil
}
