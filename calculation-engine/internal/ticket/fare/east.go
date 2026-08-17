package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"fmt"
)

// CalculateEastFare は、東日本旅客鉄道会社（JR東日本）向けの運賃計算ロジックです。
func CalculateEastFare(params ticketdomain.TicketFareParams) (int, error) {
	var targetKm int
	var err error

	switch params.LineType {
	case domain.LineTypeTrunkOnly:
		targetKm, err = params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateEastFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		// 第84条の３ 東日本旅客鉄道会社線内の営業キロが10キロメートルまでの普通旅客運賃
		if targetKm <= 10 {
			if targetKm <= 3 {
				return 160, nil
			}
			if targetKm <= 6 {
				return 200, nil
			}
			return 210, nil
		}

		// 別表第２号イの２ 東日本旅客鉄道株式会社線の大人普通旅客運賃の特定額（幹線内相互発着となる場合）
		if 201 <= targetKm && targetKm <= 220 {
			return 3850, nil
		}
		if 221 <= targetKm && targetKm <= 240 {
			return 4180, nil
		}
		if 321 <= targetKm && targetKm <= 340 {
			return 5940, nil
		}
		if 341 <= targetKm && targetKm <= 360 {
			return 6270, nil
		}
		if 461 <= targetKm && targetKm <= 480 {
			return 8030, nil
		}
		if 841 <= targetKm && targetKm <= 880 {
			return 11990, nil
		}
		if 1521 <= targetKm && targetKm <= 1560 {
			return 17270, nil
		}
		if 1961 <= targetKm && targetKm <= 2000 {
			return 20680, nil
		}
		if 2401 <= targetKm && targetKm <= 2440 {
			return 24090, nil
		}
		if 2841 <= targetKm && targetKm <= 2880 {
			return 27500, nil
		}
		if 3521 <= targetKm && targetKm <= 3560 {
			return 32780, nil
		}
		if 3961 <= targetKm && targetKm <= 4000 {
			return 36190, nil
		}
		if 4401 <= targetKm && targetKm <= 4440 {
			return 39600, nil
		}
		if 4841 <= targetKm && targetKm <= 4880 {
			return 43010, nil
		}

		splitKilo, err := calculateSplitKiloOfTrunk(targetKm)
		if err != nil {
			return 0, err
		}

		if targetKm <= 100 {
			return ceil1000(ceil1000(1696*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 300 {
			return ceil1000(round10000(1696*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 600 {
			return ceil1000(round10000(1696*300+1345*(splitKilo-300))*11/10) / 100, nil
		}
		return ceil1000(round10000(1696*300+1345*300+705*(splitKilo-600))*11/10) / 100, nil

	case domain.LineTypeLocalOnly:
		targetKm, err = params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateEastFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		if targetKm <= 10 {
			if targetKm <= 3 {
				return 160, nil
			}
			if targetKm <= 6 {
				return 200, nil
			}
			return 220, nil
		}

		// 別表第２号イの６ 東日本旅客鉄道株式会社線の大人普通旅客運賃の特定額（地方交通線内相互発着となる場合）
		if 11 <= targetKm && targetKm <= 15 {
			return 260, nil
		}
		if 16 <= targetKm && targetKm <= 20 {
			return 350, nil
		}
		if 21 <= targetKm && targetKm <= 23 {
			return 440, nil
		}
		if 24 <= targetKm && targetKm <= 28 {
			return 530, nil
		}
		if 33 <= targetKm && targetKm <= 37 {
			return 720, nil
		}
		if 42 <= targetKm && targetKm <= 46 {
			return 910, nil
		}
		if 47 <= targetKm && targetKm <= 55 {
			return 1040, nil
		}
		if 56 <= targetKm && targetKm <= 64 {
			return 1230, nil
		}
		if 65 <= targetKm && targetKm <= 73 {
			return 1410, nil
		}
		if 74 <= targetKm && targetKm <= 82 {
			return 1600, nil
		}
		if 83 <= targetKm && targetKm <= 91 {
			return 1790, nil
		}
		if 101 <= targetKm && targetKm <= 110 {
			return 2090, nil
		}
		if 129 <= targetKm && targetKm <= 146 {
			return 2750, nil
		}
		if 183 <= targetKm && targetKm <= 200 {
			return 3850, nil
		}
		if 201 <= targetKm && targetKm <= 219 {
			return 4180, nil
		}
		if 220 <= targetKm && targetKm <= 237 {
			return 4620, nil
		}
		if 292 <= targetKm && targetKm <= 310 {
			return 5940, nil
		}
		if 311 <= targetKm && targetKm <= 328 {
			return 6270, nil
		}
		if 420 <= targetKm && targetKm <= 437 {
			return 8030, nil
		}
		if 438 <= targetKm && targetKm <= 455 {
			return 8360, nil
		}
		if 547 <= targetKm && targetKm <= 582 {
			return 10120, nil
		}
		if 583 <= targetKm && targetKm <= 619 {
			return 10450, nil
		}
		if 729 <= targetKm && targetKm <= 764 {
			return 11660, nil
		}
		if 765 <= targetKm && targetKm <= 800 {
			return 11990, nil
		}
		if 947 <= targetKm && targetKm <= 982 {
			return 13530, nil
		}
		if 1129 <= targetKm && targetKm <= 1164 {
			return 15070, nil
		}

		splitKilo, err := calculateSplitKiloOfLocal(targetKm)
		if err != nil {
			return 0, err
		}

		if targetKm <= 100 {
			return ceil1000(ceil1000(1866*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 273 {
			return ceil1000(round10000(1866*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 546 {
			return ceil1000(round10000(1866*273+1480*(splitKilo-273))*11/10) / 100, nil
		}
		return ceil1000(round10000(1866*273+1480*273+770*(splitKilo-546))*11/10) / 100, nil

	case domain.LineTypeMixed:
		eigyoKm, err := params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateEastFare: %w", err)
		}
		if eigyoKm <= 10 {
			if eigyoKm <= 3 {
				return 160, nil
			}
			if eigyoKm <= 6 {
				return 200, nil
			}
			return 220, nil
		}

		targetKm, err = params.GiseiKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateEastFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		if 201 <= targetKm && targetKm <= 220 {
			return 3850, nil
		}
		if 221 <= targetKm && targetKm <= 240 {
			return 4180, nil
		}
		if 321 <= targetKm && targetKm <= 340 {
			return 5940, nil
		}
		if 341 <= targetKm && targetKm <= 360 {
			return 6270, nil
		}
		if 461 <= targetKm && targetKm <= 480 {
			return 8030, nil
		}
		if 841 <= targetKm && targetKm <= 880 {
			return 11990, nil
		}
		if 1521 <= targetKm && targetKm <= 1560 {
			return 17270, nil
		}
		if 1961 <= targetKm && targetKm <= 2000 {
			return 20680, nil
		}
		if 2401 <= targetKm && targetKm <= 2440 {
			return 24090, nil
		}
		if 2841 <= targetKm && targetKm <= 2880 {
			return 27500, nil
		}
		if 3521 <= targetKm && targetKm <= 3560 {
			return 32780, nil
		}
		if 3961 <= targetKm && targetKm <= 4000 {
			return 36190, nil
		}
		if 4401 <= targetKm && targetKm <= 4440 {
			return 39600, nil
		}
		if 4841 <= targetKm && targetKm <= 4880 {
			return 43010, nil
		}

		splitKilo, err := calculateSplitKiloOfTrunk(targetKm)
		if err != nil {
			return 0, err
		}

		if targetKm <= 100 {
			return ceil1000(ceil1000(1696*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 300 {
			return ceil1000(round10000(1696*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 600 {
			return ceil1000(round10000(1696*300+1345*(splitKilo-300))*11/10) / 100, nil
		}
		return ceil1000(round10000(1696*300+1345*300+705*(splitKilo-600))*11/10) / 100, nil

	default:
		return 0, fmt.Errorf("CalculateEastFare: %w", ErrInvalidLineType)
	}
}
