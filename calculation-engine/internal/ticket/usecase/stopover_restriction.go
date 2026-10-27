package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
)

// CalculateStopoverRestriction は券面に表示する途中下車の制限を返します。
// suburbanPath は有効日数と同じ判定経路、発着地は制度適用後の券面表示を使います。
func CalculateStopoverRestriction(kilo domain.DeciKilo, suburbanPath []int, g graph.Graph, zones *graphio.SpecialZoneRegistry, departure, arrival string) string {
	if IsSuburbanAreaComplete(suburbanPath, g) {
		return "下車前途無効"
	}
	yamanote := false
	if zones != nil {
		for _, name := range []string{departure, arrival} {
			if zone := zones.FindZoneByName(name); zone != nil {
				if zone.Name == "東京山手線内" {
					yamanote = true
				} else {
					return "券面表示の都区市内各駅下車前途無効"
				}
			}
		}
	}
	if yamanote {
		return "山手線内各駅下車前途無効"
	}
	if kilo <= 1000 {
		return "下車前途無効"
	}
	return ""
}
