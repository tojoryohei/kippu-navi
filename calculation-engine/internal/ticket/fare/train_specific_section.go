package fare

import (
	ticketdomain "calculation-engine/internal/ticket/domain"
	"fmt"
)

// TrainSpecificSectionCalculator は電車特定区間の運賃計算を行います。
type TrainSpecificSectionCalculator struct{}

// NewTrainSpecificSectionCalculator は新しい TrainSpecificSectionCalculator を作成します。
func NewTrainSpecificSectionCalculator() *TrainSpecificSectionCalculator {
	return &TrainSpecificSectionCalculator{}
}

// Calculate は電車特定区間の運賃を計算します。
// 第78条 電車特定区間内等の大人普通旅客運賃
func (c *TrainSpecificSectionCalculator) Calculate(params ticketdomain.TicketFareParams) (int, error) {
	// 電車特定区間は擬制キロを使用します（通常は幹線なので営業キロと一致します）。
	targetKm, err := params.GiseiKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("CalculateTrainSpecificFare: %w", err)
	}

	if targetKm == 0 {
		return 0, nil
	}

	// 第84条 営業キロが10キロメートルまでの普通旅客運賃
	if targetKm <= 10 {
		if targetKm <= 3 {
			return 140, nil
		}
		if targetKm <= 6 {
			return 170, nil
		}
		return 190, nil
	}

	splitKilo, err := calculateSplitKiloOfTrunk(targetKm)
	if err != nil {
		return 0, err
	}

	if targetKm <= 100 {
		return round1000(ceil1000(1550*splitKilo)*11/10) / 100, nil
	}
	if targetKm <= 300 {
		return round1000(round10000(1550*splitKilo)*11/10) / 100, nil
	}
	if targetKm <= 600 {
		return round1000(round10000(1550*300+1230*(splitKilo-300))*11/10) / 100, nil
	}

	return 0, fmt.Errorf("CalculateTrainSpecificFare: targetKm %d: %w", targetKm, ErrOutOfRange)
}
