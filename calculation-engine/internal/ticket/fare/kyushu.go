package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"fmt"
)

// CalculateKyushuFare は、九州旅客鉄道会社（JR九州）向けの運賃計算ロジックです。
func CalculateKyushuFare(params ticketdomain.TicketFareParams) (int, error) {
	totalEigyoKilo, err := params.EigyoKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("CalculateKyushuFare(eigyo): %w", err)
	}
	totalGiseiKilo, err := params.GiseiKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("CalculateKyushuFare(gisei): %w", err)
	}

	if totalGiseiKilo == 0 {
		return 0, nil
	}

	// 第84条の５ 九州旅客鉄道会社線内の営業キロが10キロメートルまでの普通旅客運賃
	if totalGiseiKilo == 4 && totalEigyoKilo == 3 {
		return 210, nil
	}
	if totalGiseiKilo == 11 && totalEigyoKilo == 10 {
		return 320, nil
	}
	if totalGiseiKilo <= 3 {
		return 200, nil
	}
	if totalGiseiKilo <= 6 {
		return 240, nil
	}
	if totalGiseiKilo <= 10 {
		return 270, nil
	}

	switch params.RouteType {
	case domain.RouteTypeTrunkOnly:
		// 第77条の５ 九州旅客鉄道会社内の幹線内相互発着の大人普通旅客運賃
		// （1）営業キロが11キロメートルから100キロメートルまでの場合
		if totalEigyoKilo <= 15 {
			return 340, nil
		}
		if totalEigyoKilo <= 20 {
			return 450, nil
		}
		if totalEigyoKilo <= 25 {
			return 560, nil
		}
		if totalEigyoKilo <= 30 {
			return 660, nil
		}
		if totalEigyoKilo <= 35 {
			return 760, nil
		}
		if totalEigyoKilo <= 40 {
			return 870, nil
		}
		if totalEigyoKilo <= 45 {
			return 990, nil
		}
		if totalEigyoKilo <= 50 {
			return 1090, nil
		}
		if totalEigyoKilo <= 60 {
			return 1300, nil
		}
		if totalEigyoKilo <= 70 {
			return 1510, nil
		}
		if totalEigyoKilo <= 80 {
			return 1730, nil
		}
		if totalEigyoKilo <= 90 {
			return 1930, nil
		}
		if totalEigyoKilo <= 100 {
			return 2130, nil
		}

		// （2）営業キロが100キロメートルを超える場合
		// 別表第２号イの３ 九州旅客鉄道株式会社線の大人普通旅客運賃の特定額
		if 301 <= totalEigyoKilo && totalEigyoKilo <= 320 {
			return 6600, nil
		}
		if 321 <= totalEigyoKilo && totalEigyoKilo <= 340 {
			return 6820, nil
		}
		if 341 <= totalEigyoKilo && totalEigyoKilo <= 360 {
			return 7150, nil
		}
		if 381 <= totalEigyoKilo && totalEigyoKilo <= 400 {
			return 7700, nil
		}
		if 421 <= totalEigyoKilo && totalEigyoKilo <= 440 {
			return 8250, nil
		}
		if 441 <= totalEigyoKilo && totalEigyoKilo <= 460 {
			return 8580, nil
		}
		if 461 <= totalEigyoKilo && totalEigyoKilo <= 480 {
			return 8800, nil
		}
		if 481 <= totalEigyoKilo && totalEigyoKilo <= 500 {
			return 9130, nil
		}
		if 521 <= totalEigyoKilo && totalEigyoKilo <= 540 {
			return 9680, nil
		}
		if 561 <= totalEigyoKilo && totalEigyoKilo <= 580 {
			return 10230, nil
		}
		if 581 <= totalEigyoKilo && totalEigyoKilo <= 600 {
			return 10560, nil
		}
		if 641 <= totalEigyoKilo && totalEigyoKilo <= 680 {
			return 11110, nil
		}
		if 681 <= totalEigyoKilo && totalEigyoKilo <= 720 {
			return 11440, nil
		}
		if 721 <= totalEigyoKilo && totalEigyoKilo <= 760 {
			return 11770, nil
		}
		if 841 <= totalEigyoKilo && totalEigyoKilo <= 880 {
			return 12650, nil
		}
		if 881 <= totalEigyoKilo && totalEigyoKilo <= 920 {
			return 12980, nil
		}
		if 921 <= totalEigyoKilo && totalEigyoKilo <= 960 {
			return 13310, nil
		}
		if 961 <= totalEigyoKilo && totalEigyoKilo <= 1000 {
			return 13640, nil
		}
		if 1081 <= totalEigyoKilo && totalEigyoKilo <= 1120 {
			return 14520, nil
		}
		if 1121 <= totalEigyoKilo && totalEigyoKilo <= 1160 {
			return 14850, nil
		}
		if 1161 <= totalEigyoKilo && totalEigyoKilo <= 1200 {
			return 15180, nil
		}
		if 1201 <= totalEigyoKilo && totalEigyoKilo <= 1240 {
			return 15510, nil
		}
		if 1321 <= totalEigyoKilo && totalEigyoKilo <= 1360 {
			return 16390, nil
		}
		if 1361 <= totalEigyoKilo && totalEigyoKilo <= 1400 {
			return 16720, nil
		}
		if 1401 <= totalEigyoKilo && totalEigyoKilo <= 1440 {
			return 17050, nil
		}
		if 1521 <= totalEigyoKilo && totalEigyoKilo <= 1560 {
			return 17930, nil
		}
		if 1561 <= totalEigyoKilo && totalEigyoKilo <= 1600 {
			return 18260, nil
		}
		if 1601 <= totalEigyoKilo && totalEigyoKilo <= 1640 {
			return 18590, nil
		}
		if 1641 <= totalEigyoKilo && totalEigyoKilo <= 1680 {
			return 18920, nil
		}
		if 1761 <= totalEigyoKilo && totalEigyoKilo <= 1800 {
			return 19800, nil
		}
		if 1801 <= totalEigyoKilo && totalEigyoKilo <= 1840 {
			return 20130, nil
		}
		if 1841 <= totalEigyoKilo && totalEigyoKilo <= 1880 {
			return 20460, nil
		}
		if 1961 <= totalEigyoKilo && totalEigyoKilo <= 2000 {
			return 21340, nil
		}

		splitKilo, err := calculateSplitKiloOfTrunk(totalEigyoKilo)
		if err != nil {
			return 0, err
		}
		if totalEigyoKilo <= 300 {
			return round1000(round10000(1975*splitKilo)*11/10) / 100, nil
		}
		if totalEigyoKilo <= 600 {
			return round1000(round10000(1975*300+1285*(splitKilo-300))*11/10) / 100, nil
		}
		return round1000(round10000(1975*300+1285*300+705*(splitKilo-600))*11/10) / 100, nil

	case domain.RouteTypeLocalOnly:
		// 第77条の１０ 九州旅客鉄道会社線内の地方交通線内相互発着の大人普通旅客運賃
		if totalGiseiKilo == 11 {
			return 320, nil
		}
		if totalGiseiKilo == 16 {
			return 360, nil
		}
		if totalGiseiKilo == 17 && totalEigyoKilo == 15 {
			return 360, nil
		}
		if totalGiseiKilo == 21 {
			return 470, nil
		}
		if totalGiseiKilo == 22 {
			return 470, nil
		}
		if totalGiseiKilo == 26 && totalEigyoKilo == 23 {
			return 580, nil
		}
		if totalGiseiKilo == 31 && totalEigyoKilo == 28 {
			return 700, nil
		}
		if totalGiseiKilo == 36 && totalEigyoKilo == 32 {
			return 840, nil
		}
		if totalGiseiKilo == 41 && totalEigyoKilo == 37 {
			return 940, nil
		}
		if totalGiseiKilo == 46 && totalEigyoKilo == 41 {
			return 1070, nil
		}
		if totalGiseiKilo == 51 && totalEigyoKilo == 46 {
			return 1170, nil
		}
		if totalGiseiKilo == 61 && totalEigyoKilo == 55 {
			return 1380, nil
		}
		if totalGiseiKilo == 71 && totalEigyoKilo == 64 {
			return 1610, nil
		}
		if totalGiseiKilo == 81 && totalEigyoKilo == 73 {
			return 1730, nil
		}
		if totalGiseiKilo == 91 && totalEigyoKilo == 82 {
			return 1950, nil
		}
		if totalGiseiKilo == 101 && totalEigyoKilo == 91 {
			return 2130, nil
		}
		if totalGiseiKilo == 121 {
			return 2670, nil
		}
		if totalGiseiKilo == 141 && totalEigyoKilo == 128 {
			return 3150, nil
		}
		if totalGiseiKilo == 161 && totalEigyoKilo == 146 {
			return 3580, nil
		}
		if totalGiseiKilo == 181 && totalEigyoKilo == 164 {
			return 4120, nil
		}

		// （1）擬制キロが11キロメートルから100キロメートルまでの場合
		if totalGiseiKilo <= 15 {
			return 340, nil
		}
		if totalGiseiKilo <= 20 {
			return 450, nil
		}
		if totalGiseiKilo <= 25 {
			return 560, nil
		}
		if totalGiseiKilo <= 30 {
			return 660, nil
		}
		if totalGiseiKilo <= 35 {
			return 760, nil
		}
		if totalGiseiKilo <= 40 {
			return 870, nil
		}
		if totalGiseiKilo <= 45 {
			return 990, nil
		}
		if totalGiseiKilo <= 50 {
			return 1090, nil
		}
		if totalGiseiKilo <= 60 {
			return 1300, nil
		}
		if totalGiseiKilo <= 70 {
			return 1510, nil
		}
		if totalGiseiKilo <= 80 {
			return 1730, nil
		}
		if totalGiseiKilo <= 90 {
			return 1930, nil
		}
		if totalGiseiKilo <= 100 {
			return 2130, nil
		}

		// （2）擬制キロが100キロメートルを超える場合
		// 別表第２号イの３ 九州旅客鉄道株式会社線の大人普通旅客運賃の特定額
		if 301 <= totalGiseiKilo && totalGiseiKilo <= 320 {
			return 6600, nil
		}
		if 321 <= totalGiseiKilo && totalGiseiKilo <= 340 {
			return 6820, nil
		}
		if 341 <= totalGiseiKilo && totalGiseiKilo <= 360 {
			return 7150, nil
		}
		if 381 <= totalGiseiKilo && totalGiseiKilo <= 400 {
			return 7700, nil
		}
		if 421 <= totalGiseiKilo && totalGiseiKilo <= 440 {
			return 8250, nil
		}
		if 441 <= totalGiseiKilo && totalGiseiKilo <= 460 {
			return 8580, nil
		}
		if 461 <= totalGiseiKilo && totalGiseiKilo <= 480 {
			return 8800, nil
		}
		if 481 <= totalGiseiKilo && totalGiseiKilo <= 500 {
			return 9130, nil
		}
		if 521 <= totalGiseiKilo && totalGiseiKilo <= 540 {
			return 9680, nil
		}
		if 561 <= totalGiseiKilo && totalGiseiKilo <= 580 {
			return 10230, nil
		}
		if 581 <= totalGiseiKilo && totalGiseiKilo <= 600 {
			return 10560, nil
		}
		if 641 <= totalGiseiKilo && totalGiseiKilo <= 680 {
			return 11110, nil
		}
		if 681 <= totalGiseiKilo && totalGiseiKilo <= 720 {
			return 11440, nil
		}
		if 721 <= totalGiseiKilo && totalGiseiKilo <= 760 {
			return 11770, nil
		}
		if 841 <= totalGiseiKilo && totalGiseiKilo <= 880 {
			return 12650, nil
		}
		if 881 <= totalGiseiKilo && totalGiseiKilo <= 920 {
			return 12980, nil
		}
		if 921 <= totalGiseiKilo && totalGiseiKilo <= 960 {
			return 13310, nil
		}
		if 961 <= totalGiseiKilo && totalGiseiKilo <= 1000 {
			return 13640, nil
		}
		if 1081 <= totalGiseiKilo && totalGiseiKilo <= 1120 {
			return 14520, nil
		}
		if 1121 <= totalGiseiKilo && totalGiseiKilo <= 1160 {
			return 14850, nil
		}
		if 1161 <= totalGiseiKilo && totalGiseiKilo <= 1200 {
			return 15180, nil
		}
		if 1201 <= totalGiseiKilo && totalGiseiKilo <= 1240 {
			return 15510, nil
		}
		if 1321 <= totalGiseiKilo && totalGiseiKilo <= 1360 {
			return 16390, nil
		}
		if 1361 <= totalGiseiKilo && totalGiseiKilo <= 1400 {
			return 16720, nil
		}
		if 1401 <= totalGiseiKilo && totalGiseiKilo <= 1440 {
			return 17050, nil
		}
		if 1521 <= totalGiseiKilo && totalGiseiKilo <= 1560 {
			return 17930, nil
		}
		if 1561 <= totalGiseiKilo && totalGiseiKilo <= 1600 {
			return 18260, nil
		}
		if 1601 <= totalGiseiKilo && totalGiseiKilo <= 1640 {
			return 18590, nil
		}
		if 1641 <= totalGiseiKilo && totalGiseiKilo <= 1680 {
			return 18920, nil
		}
		if 1761 <= totalGiseiKilo && totalGiseiKilo <= 1800 {
			return 19800, nil
		}
		if 1801 <= totalGiseiKilo && totalGiseiKilo <= 1840 {
			return 20130, nil
		}
		if 1841 <= totalGiseiKilo && totalGiseiKilo <= 1880 {
			return 20460, nil
		}
		if 1961 <= totalGiseiKilo && totalGiseiKilo <= 2000 {
			return 21340, nil
		}

		splitKilo, err := calculateSplitKiloOfTrunk(totalGiseiKilo)
		if err != nil {
			return 0, err
		}
		if totalGiseiKilo <= 300 {
			return round1000(round10000(1975*splitKilo)*11/10) / 100, nil
		}
		if totalGiseiKilo <= 600 {
			return round1000(round10000(1975*300+1285*(splitKilo-300))*11/10) / 100, nil
		}
		return round1000(round10000(1975*300+1285*300+705*(splitKilo-600))*11/10) / 100, nil

	case domain.RouteTypeMixed:
		// 第81条の５ 九州旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人普通旅客運賃
		// （1）擬制キロが11キロメートルから100キロメートルまでの場合
		if totalGiseiKilo <= 15 {
			return 340, nil
		}
		if totalGiseiKilo <= 20 {
			return 450, nil
		}
		if totalGiseiKilo <= 25 {
			return 560, nil
		}
		if totalGiseiKilo <= 30 {
			return 660, nil
		}
		if totalGiseiKilo <= 35 {
			return 760, nil
		}
		if totalGiseiKilo <= 40 {
			return 870, nil
		}
		if totalGiseiKilo <= 45 {
			return 990, nil
		}
		if totalGiseiKilo <= 50 {
			return 1090, nil
		}
		if totalGiseiKilo <= 60 {
			return 1300, nil
		}
		if totalGiseiKilo <= 70 {
			return 1510, nil
		}
		if totalGiseiKilo <= 80 {
			return 1730, nil
		}
		if totalGiseiKilo <= 90 {
			return 1930, nil
		}
		if totalGiseiKilo <= 100 {
			return 2130, nil
		}

		// （2）擬制キロが100キロメートルを超える場合
		// 別表第２号イの３ 九州旅客鉄道株式会社線の大人普通旅客運賃の特定額
		if 301 <= totalGiseiKilo && totalGiseiKilo <= 320 {
			return 6600, nil
		}
		if 321 <= totalGiseiKilo && totalGiseiKilo <= 340 {
			return 6820, nil
		}
		if 341 <= totalGiseiKilo && totalGiseiKilo <= 360 {
			return 7150, nil
		}
		if 381 <= totalGiseiKilo && totalGiseiKilo <= 400 {
			return 7700, nil
		}
		if 421 <= totalGiseiKilo && totalGiseiKilo <= 440 {
			return 8250, nil
		}
		if 441 <= totalGiseiKilo && totalGiseiKilo <= 460 {
			return 8580, nil
		}
		if 461 <= totalGiseiKilo && totalGiseiKilo <= 480 {
			return 8800, nil
		}
		if 481 <= totalGiseiKilo && totalGiseiKilo <= 500 {
			return 9130, nil
		}
		if 521 <= totalGiseiKilo && totalGiseiKilo <= 540 {
			return 9680, nil
		}
		if 561 <= totalGiseiKilo && totalGiseiKilo <= 580 {
			return 10230, nil
		}
		if 581 <= totalGiseiKilo && totalGiseiKilo <= 600 {
			return 10560, nil
		}
		if 641 <= totalGiseiKilo && totalGiseiKilo <= 680 {
			return 11110, nil
		}
		if 681 <= totalGiseiKilo && totalGiseiKilo <= 720 {
			return 11440, nil
		}
		if 721 <= totalGiseiKilo && totalGiseiKilo <= 760 {
			return 11770, nil
		}
		if 841 <= totalGiseiKilo && totalGiseiKilo <= 880 {
			return 12650, nil
		}
		if 881 <= totalGiseiKilo && totalGiseiKilo <= 920 {
			return 12980, nil
		}
		if 921 <= totalGiseiKilo && totalGiseiKilo <= 960 {
			return 13310, nil
		}
		if 961 <= totalGiseiKilo && totalGiseiKilo <= 1000 {
			return 13640, nil
		}
		if 1081 <= totalGiseiKilo && totalGiseiKilo <= 1120 {
			return 14520, nil
		}
		if 1121 <= totalGiseiKilo && totalGiseiKilo <= 1160 {
			return 14850, nil
		}
		if 1161 <= totalGiseiKilo && totalGiseiKilo <= 1200 {
			return 15180, nil
		}
		if 1201 <= totalGiseiKilo && totalGiseiKilo <= 1240 {
			return 15510, nil
		}
		if 1321 <= totalGiseiKilo && totalGiseiKilo <= 1360 {
			return 16390, nil
		}
		if 1361 <= totalGiseiKilo && totalGiseiKilo <= 1400 {
			return 16720, nil
		}
		if 1401 <= totalGiseiKilo && totalGiseiKilo <= 1440 {
			return 17050, nil
		}
		if 1521 <= totalGiseiKilo && totalGiseiKilo <= 1560 {
			return 17930, nil
		}
		if 1561 <= totalGiseiKilo && totalGiseiKilo <= 1600 {
			return 18260, nil
		}
		if 1601 <= totalGiseiKilo && totalGiseiKilo <= 1640 {
			return 18590, nil
		}
		if 1641 <= totalGiseiKilo && totalGiseiKilo <= 1680 {
			return 18920, nil
		}
		if 1761 <= totalGiseiKilo && totalGiseiKilo <= 1800 {
			return 19800, nil
		}
		if 1801 <= totalGiseiKilo && totalGiseiKilo <= 1840 {
			return 20130, nil
		}
		if 1841 <= totalGiseiKilo && totalGiseiKilo <= 1880 {
			return 20460, nil
		}
		if 1961 <= totalGiseiKilo && totalGiseiKilo <= 2000 {
			return 21340, nil
		}

		splitKilo, err := calculateSplitKiloOfTrunk(totalGiseiKilo)
		if err != nil {
			return 0, err
		}
		if totalGiseiKilo <= 300 {
			return round1000(round10000(1975*splitKilo)*11/10) / 100, nil
		}
		if totalGiseiKilo <= 600 {
			return round1000(round10000(1975*300+1285*(splitKilo-300))*11/10) / 100, nil
		}
		return round1000(round10000(1975*300+1285*300+705*(splitKilo-600))*11/10) / 100, nil

	default:
		return 0, fmt.Errorf("CalculateKyushuFare: %w", ErrInvalidRouteType)
	}
}
