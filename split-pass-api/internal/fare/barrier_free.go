package fare

import (
	"fmt"
	"split-pass-api/internal/domain"
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

// CalculateBarrierFreeFee は月数に応じたバリアフリー料金を計算します。
// 1ヶ月: 300円、3ヶ月: 900円、6ヶ月: 1800円
func CalculateBarrierFreeFee(months int) (int, error) {
	switch months {
	case 1:
		return 300, nil
	case 3:
		return 900, nil
	case 6:
		return 1800, nil
	default:
		return 0, fmt.Errorf("CalculateBarrierFreeFee: %w", domain.ErrInvalidMonths)
	}
}
