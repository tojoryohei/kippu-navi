package fare

import (
	"fmt"
	"split-pass-api/internal/domain"
)

// IsAllTrainSpecificApplicable は指定された全区間が電車特定区間に収まっているかを判定します。
func IsAllTrainSpecificApplicable(edges []*domain.Edge) bool {
	if len(edges) == 0 {
		return false
	}
	for _, e := range edges {
		if e == nil || !e.IsTrainSpecificSection {
			return false
		}
	}
	return true
}

// TrainSpecificSectionCalculator は電車特定区間の運賃計算を行います。
type TrainSpecificSectionCalculator struct {
	fares [101]domain.PassFare
}

// NewTrainSpecificSectionCalculator は運賃データを受け取り、計算機を初期化します。
func NewTrainSpecificSectionCalculator(fares [101]domain.PassFare) *TrainSpecificSectionCalculator {
	return &TrainSpecificSectionCalculator{fares: fares}
}

// Calculate は電車特定区間の運賃を計算します。
func (c *TrainSpecificSectionCalculator) Calculate(params domain.PassFareParams) (int, error) {
	// 電車特定区間は営業キロ（切り上げ）を使用します。
	targetKm, err := params.EigyoKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("CalculateTrainSpecificFare: %w", err)
	}
	return calculateFromTable(targetKm, params.Months, &c.fares)
}
