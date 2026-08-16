package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"fmt"
)

// CalculateHokkaidoFare は、北海道旅客鉄道会社（JR北海道）向けの運賃計算ロジックです。
func CalculateHokkaidoFare(params ticketdomain.TicketFareParams) (int, error) {
	var targetKm int
	var err error

	switch params.RouteType {
	case domain.RouteTypeTrunkOnly:
		targetKm, err = params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateHokkaidoFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		// 第84条の２ 北海道旅客鉄道会社線内の営業キロが10キロメートルまでの普通旅客運賃
		if targetKm <= 10 {
			if targetKm <= 3 {
				return 210, nil
			}
			if targetKm <= 6 {
				return 270, nil
			}
			return 310, nil
		}

		// 別表第２号イ 北海道旅客鉄道株式会社線の大人普通旅客運賃の特定額（幹線内相互発着となる場合）
		if 321 <= targetKm && targetKm <= 340 {
			return 6820, nil
		}
		if 841 <= targetKm && targetKm <= 880 {
			return 12650, nil
		}

		// （1）営業キロが11キロメートルから100キロメートルまでの場合
		if targetKm <= 15 {
			return 360, nil
		}
		if targetKm <= 20 {
			return 470, nil
		}
		if targetKm <= 25 {
			return 580, nil
		}
		if targetKm <= 30 {
			return 680, nil
		}
		if targetKm <= 35 {
			return 800, nil
		}
		if targetKm <= 40 {
			return 920, nil
		}
		if targetKm <= 45 {
			return 1040, nil
		}
		if targetKm <= 50 {
			return 1210, nil
		}
		if targetKm <= 60 {
			return 1380, nil
		}
		if targetKm <= 70 {
			return 1590, nil
		}
		if targetKm <= 80 {
			return 1800, nil
		}
		if targetKm <= 90 {
			return 2020, nil
		}
		if targetKm <= 100 {
			return 2240, nil
		}

		// （2）営業キロが100キロメートルを超える場合
		splitKilo, err := calculateSplitKiloOfTrunk(targetKm)
		if err != nil {
			return 0, err
		}
		if targetKm <= 200 {
			return round1000(round10000(2116*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 300 {
			return round1000(round10000(2116*200+1636*(splitKilo-200))*11/10) / 100, nil
		}
		if targetKm <= 600 {
			return round1000(round10000(2116*200+1636*100+1283*(splitKilo-300))*11/10) / 100, nil
		}
		return round1000(round10000(2116*200+1636*100+1283*300+705*(splitKilo-600))*11/10) / 100, nil

	case domain.RouteTypeLocalOnly:
		targetKm, err = params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateHokkaidoFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		if targetKm <= 10 {
			if targetKm <= 3 {
				return 210, nil
			}
			if targetKm <= 6 {
				return 270, nil
			}
			return 320, nil
		}

		// 別表第2号イの5 北海道旅客鉄道株式会社線の大人普通旅客運賃の特定額（地方交通線内相互発着となる場合）
		if 101 <= targetKm && targetKm <= 110 {
			return 2530, nil
		}
		if 292 <= targetKm && targetKm <= 310 {
			return 6820, nil
		}

		// （1）営業キロが11キロメートルから100キロメートルまでの場合
		if targetKm <= 15 {
			return 360, nil
		}
		if targetKm <= 20 {
			return 470, nil
		}
		if targetKm <= 23 {
			return 580, nil
		}
		if targetKm <= 28 {
			return 680, nil
		}
		if targetKm <= 32 {
			return 800, nil
		}
		if targetKm <= 37 {
			return 920, nil
		}
		if targetKm <= 41 {
			return 1040, nil
		}
		if targetKm <= 46 {
			return 1210, nil
		}
		if targetKm <= 55 {
			return 1380, nil
		}
		if targetKm <= 64 {
			return 1590, nil
		}
		if targetKm <= 73 {
			return 1800, nil
		}
		if targetKm <= 82 {
			return 2020, nil
		}
		if targetKm <= 91 {
			return 2240, nil
		}
		if targetKm <= 100 {
			return 2480, nil
		}

		// （2）営業キロが100キロメートルを超える場合
		splitKilo, err := calculateSplitKiloOfLocal(targetKm)
		if err != nil {
			return 0, err
		}
		if targetKm <= 182 {
			return round1000(round10000(2311*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 273 {
			return round1000(round10000(2311*182+1835*(splitKilo-182))*11/10) / 100, nil
		}
		if targetKm <= 546 {
			return round1000(round10000(2311*182+1835*91+1402*(splitKilo-273))*11/10) / 100, nil
		}
		return round1000(round10000(2311*182+1835*91+1402*273+772*(splitKilo-546))*11/10) / 100, nil

	case domain.RouteTypeMixed:
		eigyoKm, err := params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateHokkaidoFare: %w", err)
		}
		if eigyoKm <= 10 {
			if eigyoKm <= 3 {
				return 210, nil
			}
			if eigyoKm <= 6 {
				return 270, nil
			}
			return 320, nil
		}

		targetKm, err = params.GiseiKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("CalculateHokkaidoFare: %w", err)
		}

		if targetKm == 0 {
			return 0, nil
		}

		if targetKm <= 15 {
			return 360, nil
		}
		if targetKm <= 20 {
			return 470, nil
		}
		if targetKm <= 25 {
			return 580, nil
		}
		if targetKm <= 30 {
			return 680, nil
		}
		if targetKm <= 35 {
			return 800, nil
		}
		if targetKm <= 40 {
			return 920, nil
		}
		if targetKm <= 45 {
			return 1040, nil
		}
		if targetKm <= 50 {
			return 1210, nil
		}
		if targetKm <= 60 {
			return 1380, nil
		}
		if targetKm <= 70 {
			return 1590, nil
		}
		if targetKm <= 80 {
			return 1800, nil
		}
		if targetKm <= 90 {
			return 2020, nil
		}
		if targetKm <= 100 {
			return 2240, nil
		}

		splitKilo, err := calculateSplitKiloOfTrunk(targetKm)
		if err != nil {
			return 0, err
		}
		if targetKm <= 200 {
			return round1000(round10000(2116*splitKilo)*11/10) / 100, nil
		}
		if targetKm <= 300 {
			return round1000(round10000(2116*200+1636*(splitKilo-200))*11/10) / 100, nil
		}
		if targetKm <= 600 {
			return round1000(round10000(2116*200+1636*100+1283*(splitKilo-300))*11/10) / 100, nil
		}
		return round1000(round10000(2116*200+1636*100+1283*300+705*(splitKilo-600))*11/10) / 100, nil

	default:
		return 0, fmt.Errorf("CalculateHokkaidoFare: %w", ErrInvalidRouteType)
	}
}
