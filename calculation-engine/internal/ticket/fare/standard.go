package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"fmt"
)

// CalculateStandardFare は、幹線と地方交通線の運賃計算ロジック（本州2社ベース）です。
func CalculateStandardFare(params ticketdomain.TicketFareParams) (int, error) {
	var targetKm int
	var err error

	switch params.LineType {
	case domain.LineTypeTrunkOnly:
		targetKm, err = params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateStandardFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		if targetKm <= 10 {
			if targetKm <= 3 {
				return 150, nil
			}
			if targetKm <= 6 {
				return 190, nil
			}
			return 200, nil
		}

		splitKilo, err := calculateSplitKiloOfTrunk(targetKm)
		if err != nil {
			return 0, err
		}

		if targetKm <= 100 {
			return round1000(ceil1000(1620*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 300 {
			return round1000(round10000(1620*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 600 {
			return round1000(round10000(1620*300+1285*(splitKilo-300))*11/10) / 100, nil
		}
		return round1000(round10000(1620*300+1285*300+705*(splitKilo-600))*11/10) / 100, nil

	case domain.LineTypeLocalOnly:
		targetKm, err = params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateStandardFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		if targetKm <= 10 {
			if targetKm <= 3 {
				return 150, nil
			}
			if targetKm <= 6 {
				return 190, nil
			}
			return 210, nil
		}

		if 11 <= targetKm && targetKm <= 15 {
			return 240, nil
		}
		if 16 <= targetKm && targetKm <= 20 {
			return 330, nil
		}
		if 21 <= targetKm && targetKm <= 23 {
			return 420, nil
		}
		if 24 <= targetKm && targetKm <= 28 {
			return 510, nil
		}
		if 33 <= targetKm && targetKm <= 37 {
			return 680, nil
		}
		if 42 <= targetKm && targetKm <= 46 {
			return 860, nil
		}
		if 47 <= targetKm && targetKm <= 55 {
			return 990, nil
		}
		if 56 <= targetKm && targetKm <= 64 {
			return 1170, nil
		}
		if 65 <= targetKm && targetKm <= 73 {
			return 1340, nil
		}
		if 74 <= targetKm && targetKm <= 82 {
			return 1520, nil
		}
		if 83 <= targetKm && targetKm <= 91 {
			return 1690, nil
		}
		if 101 <= targetKm && targetKm <= 110 {
			return 1980, nil
		}
		if 292 <= targetKm && targetKm <= 310 {
			return 5720, nil
		}

		splitKilo, err := calculateSplitKiloOfLocal(targetKm)
		if err != nil {
			return 0, err
		}

		if targetKm <= 100 {
			return round1000(ceil1000(1780*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 273 {
			return round1000(round10000(1780*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 546 {
			return round1000(round10000(1780*273+1410*(splitKilo-273))*11/10) / 100, nil
		}
		return round1000(round10000(1780*273+1410*273+770*(splitKilo-546))*11/10) / 100, nil

	case domain.LineTypeMixed:
		eigyoKm, err := params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateStandardFare: %w", err)
		}
		if eigyoKm <= 10 {
			if eigyoKm <= 3 {
				return 150, nil
			}
			if eigyoKm <= 6 {
				return 190, nil
			}
			return 210, nil
		}

		targetKm, err = params.GiseiKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateStandardFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		splitKilo, err := calculateSplitKiloOfTrunk(targetKm)
		if err != nil {
			return 0, err
		}

		if targetKm <= 100 {
			return round1000(ceil1000(1620*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 300 {
			return round1000(round10000(1620*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 600 {
			return round1000(round10000(1620*300+1285*(splitKilo-300))*11/10) / 100, nil
		}
		return round1000(round10000(1620*300+1285*300+705*(splitKilo-600))*11/10) / 100, nil

	default:
		return 0, fmt.Errorf("CalculateStandardFare: %w", ErrInvalidLineType)
	}
}
