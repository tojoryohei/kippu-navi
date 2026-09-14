package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
)

// GetMaxGiseiKiloByAmount は指定された運賃(amount)以下となる可能性のある最大擬制キロを返します。
// 電車特定区間（大阪ー京都など）が最もキロ単価が安いため、これを基準として上限を計算します。
func GetMaxGiseiKiloByAmount(amount int) domain.DeciKilo {
	if amount < 140 {
		return 0
	}

	calc := NewTrainSpecificSectionCalculator()
	var low, high domain.DeciKilo = 0, 30000

	for low < high {
		mid := (low + high + 1) / 2
		f, err := calc.Calculate(ticketdomain.TicketFareParams{GiseiKilo: mid})
		if err != nil {
			high = mid - 1
			continue
		}

		if f <= amount {
			low = mid
		} else {
			high = mid - 1
		}
	}

	return low
}
