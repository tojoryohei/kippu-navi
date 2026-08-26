package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"fmt"
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
// TSのアルゴリズム（第86条・第87条）をGoに移植したものです。
func (s *SpecialZoneApplier) Apply(path []int, originZone, destZone *ticketdomain.SpecialZone) (*AppliedZoneInfo, bool) {
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

			boundaryStations := destZone.Stations

			var changingIdx []int
			for i := 0; i < len(newPath)-1; i++ {
				currName := s.graph.GetName(newPath[i])
				prevName := ""
				if i > 0 {
					prevName = s.graph.GetName(newPath[i-1])
				}
				nextName := s.graph.GetName(newPath[i+1])

				// 大阪市内の特例
				if i != 0 && destZone.Name == "大阪市内" && prevName == "加島" && currName == "尼崎" && nextName == "塚本" {
					if len(changingIdx) > 0 {
						changingIdx = changingIdx[:len(changingIdx)-1]
					}
				} else if i != 0 && destZone.Name == "大阪市内" && prevName == "塚本" && currName == "尼崎" && nextName == "加島" {
					if len(changingIdx) > 0 {
						changingIdx = changingIdx[:len(changingIdx)-1]
					}
				} else if i != 0 && destZone.Name == "大阪市内" && prevName == "加美" && currName == "久宝寺" && nextName == "新加美" {
					if len(changingIdx) > 0 {
						changingIdx = changingIdx[:len(changingIdx)-1]
					}
				} else if i != 0 && destZone.Name == "大阪市内" && prevName == "新加美" && currName == "久宝寺" && nextName == "加美" {
					if len(changingIdx) > 0 {
						changingIdx = changingIdx[:len(changingIdx)-1]
					}
				} else {
					inCurr := isStationInSet(currName, boundaryStations)
					inNext := isStationInSet(nextName, boundaryStations)
					if inCurr != inNext {
						changingIdx = append(changingIdx, i)
					}
				}
			}

			if len(changingIdx) == 1 || len(changingIdx) == 2 {
				zoneID, ok := s.graph.GetID(destZone.Name)
				fmt.Printf("Apply: destZone=%s, changingIdx=%v, zoneID=%d, ok=%v\n", destZone.Name, changingIdx, zoneID, ok)
				if ok {
					lastChange := changingIdx[len(changingIdx)-1]

					var prefix []int
					// 全てのゾーンで出口駅を含める
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

			boundaryStations := originZone.Stations

			var changingIdx []int
			for i := 0; i < len(newPath)-1; i++ {
				currName := s.graph.GetName(newPath[i])
				prevName := ""
				if i > 0 {
					prevName = s.graph.GetName(newPath[i-1])
				}
				nextName := s.graph.GetName(newPath[i+1])

				// 大阪市内の特例（加島・塚本、加美・新加美間の市外通過の例外処理）
				if i != 0 && originZone.Name == "大阪市内" && prevName == "加島" && currName == "尼崎" && nextName == "塚本" {
					if len(changingIdx) > 0 {
						changingIdx = changingIdx[:len(changingIdx)-1] // pop
					}
				} else if i != 0 && originZone.Name == "大阪市内" && prevName == "塚本" && currName == "尼崎" && nextName == "加島" {
					if len(changingIdx) > 0 {
						changingIdx = changingIdx[:len(changingIdx)-1]
					}
				} else if i != 0 && originZone.Name == "大阪市内" && prevName == "加美" && currName == "久宝寺" && nextName == "新加美" {
					if len(changingIdx) > 0 {
						changingIdx = changingIdx[:len(changingIdx)-1]
					}
				} else if i != 0 && originZone.Name == "大阪市内" && prevName == "新加美" && currName == "久宝寺" && nextName == "加美" {
					if len(changingIdx) > 0 {
						changingIdx = changingIdx[:len(changingIdx)-1]
					}
				} else {
					inCurr := isStationInSet(currName, boundaryStations)
					inNext := isStationInSet(nextName, boundaryStations)
					if inCurr != inNext {
						changingIdx = append(changingIdx, i)
					}
				}
			}

			if len(changingIdx) == 1 || len(changingIdx) == 2 {
				zoneID, ok := s.graph.GetID(originZone.Name)
				fmt.Printf("Apply: originZone=%s, changingIdx=%v, zoneID=%d, ok=%v\n", originZone.Name, changingIdx, zoneID, ok)
				if ok {
					firstChange := changingIdx[0]

					var suffix []int
					// 全てのゾーンで出口駅を含める
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
