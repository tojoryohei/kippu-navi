package fare

import (
	"calculation-engine/internal/domain"
)

// IsAllBarrierFreeFeeApplicable は指定された全区間がバリアフリー対象エリアに収まっているかを判定します。
func IsAllBarrierFreeFeeApplicable(edges []*domain.Edge) bool {
	if len(edges) == 0 {
		return false
	}
	for _, e := range edges {
		if !e.IsBarrierFreeSection {
			return false
		}
	}
	return true
}

// CalculateBarrierFreeFee は乗車券用のバリアフリー料金を返します。
// 大人普通旅客運賃の場合、バリアフリー加算対象エリア内完結であれば原則10円が加算されます。
func CalculateBarrierFreeFee() int {
	return 10
}
