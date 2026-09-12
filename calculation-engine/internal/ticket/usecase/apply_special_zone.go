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

func (s *SpecialZoneApplier) apply(path []int, originZone, destZone *ticketdomain.SpecialZone, zoneChanges func([]int, *ticketdomain.SpecialZone) []int) (*AppliedZoneInfo, bool) {
	if len(path) < 2 {
		return nil, false
	}

	newPath := make([]int, len(path))
	copy(newPath, path)

	var threshold domain.DeciKilo
	appliedAny := false

	// 着駅適用
	if destZone != nil {
		destName := s.graph.GetName(newPath[len(newPath)-1])
		if isStationInSet(destName, destZone.Stations) {

			changingIdx := zoneChanges(newPath, destZone)

			if len(changingIdx) == 1 || len(changingIdx) == 2 {
				zoneID, ok := s.graph.GetID(destZone.Name)
				if ok {
					lastChange := changingIdx[len(changingIdx)-1]

					var prefix []int
					prefix = newPath[:lastChange+2]

					temp := make([]int, 0, len(prefix)+1)
					temp = append(temp, prefix...)
					temp = append(temp, zoneID)
					newPath = temp

					if destZone.MinDistanceDeciKilo > threshold {
						threshold = destZone.MinDistanceDeciKilo
					}
					appliedAny = true
				}
			}
		}
	}

	// 発駅適用
	if originZone != nil {
		originName := s.graph.GetName(newPath[0])
		if isStationInSet(originName, originZone.Stations) {

			changingIdx := zoneChanges(newPath, originZone)

			if len(changingIdx) == 1 || len(changingIdx) == 2 {
				zoneID, ok := s.graph.GetID(originZone.Name)
				if ok {
					firstChange := changingIdx[0]

					var suffix []int
					suffix = newPath[firstChange:]

					temp := make([]int, 0, 1+len(suffix))
					temp = append(temp, zoneID)
					temp = append(temp, suffix...)
					newPath = temp

					if originZone.MinDistanceDeciKilo > threshold {
						threshold = originZone.MinDistanceDeciKilo
					}
					appliedAny = true
				}
			}
		}
	}

	if !appliedAny {
		return nil, false
	}

	return &AppliedZoneInfo{
		TransformedPath: newPath,
		ThresholdKilo:   threshold,
	}, true
}
