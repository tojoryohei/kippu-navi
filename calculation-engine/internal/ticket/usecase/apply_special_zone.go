package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
)

// AppliedZoneInfo は特例ゾーンが適用された仮想経路とその閾値を保持します。
type AppliedZoneInfo struct {
	TransformedPath []int
	ThresholdKilo   domain.DeciKilo
}

// SpecialZoneApplier は経路に対して特定都区市内などの特例を適用する役割を担います。
type SpecialZoneApplier struct {
	graph        graph.Graph
	zoneRegistry *graphio.SpecialZoneRegistry
}

// NewSpecialZoneApplier は新しい SpecialZoneApplier を作成します。
func NewSpecialZoneApplier(g graph.Graph, reg *graphio.SpecialZoneRegistry) *SpecialZoneApplier {
	return &SpecialZoneApplier{
		graph:        g,
		zoneRegistry: reg,
	}
}

func isStationInSet(stationName string, stations []string) bool {
	for _, s := range stations {
		if s == stationName {
			return true
		}
	}
	return false
}

// Apply は指定された経路に出発地・到着地の特例ゾーンを適用し、成功した場合は仮想経路を返します。
func (s *SpecialZoneApplier) Apply(path []int, originZone, destZone *ticketdomain.SpecialZone) (*AppliedZoneInfo, bool) {
	return s.apply(path, originZone, destZone, s.osakaZoneChanges)
}

// ApplyUncorrect は一般的なゾーン境界を使い、大阪市内の市外通過特例を適用しません。
func (s *SpecialZoneApplier) ApplyUncorrect(path []int, originZone, destZone *ticketdomain.SpecialZone) (*AppliedZoneInfo, bool) {
	return s.apply(path, originZone, destZone, s.zoneChanges)
}

// osakaZoneChanges は通常モードの境界を判定し、大阪市内の市外通過特例を適用します。
func (s *SpecialZoneApplier) osakaZoneChanges(path []int, zone *ticketdomain.SpecialZone) []int {
	contains := func(name string) bool { return isStationInSet(name, zone.Stations) }
	if zone.Name == "東京山手線内" {
		contains = ticketdomain.IsArticle70Station
	}
	var changes []int
	for i := 0; i < len(path)-1; i++ {
		curr, next := s.graph.GetName(path[i]), s.graph.GetName(path[i+1])
		if i > 0 && zone.Name == "大阪市内" && isOsakaCityPassage(s.graph.GetName(path[i-1]), curr, next) {
			if len(changes) > 0 {
				changes = changes[:len(changes)-1]
			}
			continue
		}
		if contains(curr) != contains(next) {
			changes = append(changes, i)
		}
	}
	return changes
}

func isOsakaCityPassage(prev, curr, next string) bool {
	return (curr == "尼崎" && ((prev == "加島" && next == "塚本") || (prev == "塚本" && next == "加島"))) ||
		(curr == "久宝寺" && ((prev == "加美" && next == "新加美") || (prev == "新加美" && next == "加美")))
}

// zoneChanges は各ゾーンの駅一覧だけを使い、市外通過も境界として数えます。
func (s *SpecialZoneApplier) zoneChanges(path []int, zone *ticketdomain.SpecialZone) []int {
	var changes []int
	for i := 0; i < len(path)-1; i++ {
		curr, next := s.graph.GetName(path[i]), s.graph.GetName(path[i+1])
		if isStationInSet(curr, zone.Stations) != isStationInSet(next, zone.Stations) {
			changes = append(changes, i)
		}
	}
	return changes
}

type zoneApplicationSide uint8

const (
	zoneApplicationDestination zoneApplicationSide = iota
	zoneApplicationOrigin
)

// applyDestinationZone は着駅側のゾーン適用を行います。
func (s *SpecialZoneApplier) applyDestinationZone(path []int, zone *ticketdomain.SpecialZone, zoneChanges func([]int, *ticketdomain.SpecialZone) []int) (*AppliedZoneInfo, bool) {
	return s.applyZone(path, zone, zoneApplicationDestination, zoneChanges)
}

// applyOriginZone は発駅側のゾーン適用を行います。
func (s *SpecialZoneApplier) applyOriginZone(path []int, zone *ticketdomain.SpecialZone, zoneChanges func([]int, *ticketdomain.SpecialZone) []int) (*AppliedZoneInfo, bool) {
	return s.applyZone(path, zone, zoneApplicationOrigin, zoneChanges)
}

// applyZone は方向に応じたゾーン適用の共通処理です。
func (s *SpecialZoneApplier) applyZone(path []int, zone *ticketdomain.SpecialZone, side zoneApplicationSide, zoneChanges func([]int, *ticketdomain.SpecialZone) []int) (*AppliedZoneInfo, bool) {
	if len(path) < 2 || zone == nil {
		return nil, false
	}

	switch side {
	case zoneApplicationDestination:
		destName := s.graph.GetName(path[len(path)-1])
		if !isStationInSet(destName, zone.Stations) {
			return nil, false
		}

		changingIdx := zoneChanges(path, zone)
		if len(changingIdx) != 1 && len(changingIdx) != 2 {
			return nil, false
		}

		zoneID, ok := s.graph.GetID(zone.Name)
		if !ok {
			return nil, false
		}

		lastChange := changingIdx[len(changingIdx)-1]
		prefix := path[:lastChange+2]
		newPath := make([]int, 0, len(prefix)+1)
		newPath = append(newPath, prefix...)
		newPath = append(newPath, zoneID)
		return &AppliedZoneInfo{
			TransformedPath: newPath,
			ThresholdKilo:   zone.MinDistanceDeciKilo,
		}, true

	case zoneApplicationOrigin:
		originName := s.graph.GetName(path[0])
		if !isStationInSet(originName, zone.Stations) {
			return nil, false
		}

		changingIdx := zoneChanges(path, zone)
		if len(changingIdx) != 1 && len(changingIdx) != 2 {
			return nil, false
		}

		zoneID, ok := s.graph.GetID(zone.Name)
		if !ok {
			return nil, false
		}

		firstChange := changingIdx[0]
		suffix := path[firstChange:]
		newPath := make([]int, 0, 1+len(suffix))
		newPath = append(newPath, zoneID)
		newPath = append(newPath, suffix...)
		return &AppliedZoneInfo{
			TransformedPath: newPath,
			ThresholdKilo:   zone.MinDistanceDeciKilo,
		}, true

	default:
		return nil, false
	}
}

func (s *SpecialZoneApplier) apply(path []int, originZone, destZone *ticketdomain.SpecialZone, zoneChanges func([]int, *ticketdomain.SpecialZone) []int) (*AppliedZoneInfo, bool) {
	if len(path) < 2 {
		return nil, false
	}

	newPath := make([]int, len(path))
	copy(newPath, path)

	var threshold domain.DeciKilo
	appliedAny := false

	// 着駅適用
	if info, ok := s.applyDestinationZone(newPath, destZone, zoneChanges); ok {
		newPath = info.TransformedPath
		if info.ThresholdKilo > threshold {
			threshold = info.ThresholdKilo
		}
		appliedAny = true
	}

	// 発駅適用
	if info, ok := s.applyOriginZone(newPath, originZone, zoneChanges); ok {
		newPath = info.TransformedPath
		if info.ThresholdKilo > threshold {
			threshold = info.ThresholdKilo
		}
		appliedAny = true
	}

	if !appliedAny {
		return nil, false
	}

	return &AppliedZoneInfo{
		TransformedPath: newPath,
		ThresholdKilo:   threshold,
	}, true
}
