package fare

import (
	ticketdomain "calculation-engine/internal/ticket/domain"
	"fmt"
)

// CalculateShikokuFare は、四国旅客鉄道会社（JR四国）向けの運賃計算ロジックです。
func CalculateShikokuFare(params ticketdomain.TicketFareParams) (int, error) {
	totalEigyoKilo, err := params.EigyoKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("CalculateShikokuFare(eigyo): %w", err)
	}
	totalGiseiKilo, err := params.GiseiKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("CalculateShikokuFare(gisei): %w", err)
	}

	if totalGiseiKilo == 0 {
		return 0, nil
	}

	// 第84条の４ 四国旅客鉄道会社線内の営業キロが10キロメートルまでの普通旅客運賃
	if totalEigyoKilo <= 10 {
		if totalGiseiKilo <= 3 {
			return 190, nil
		}
		if totalGiseiKilo <= 6 {
			return 240, nil
		}
		if totalGiseiKilo <= 10 {
			return 280, nil
		}
	}

	// 第77条の４ 四国旅客鉄道会社内の幹線内相互発着の大人普通旅客運賃
	// 第77条の９ 四国旅客鉄道会社内の地方交通線内相互発着の大人普通旅客運賃
	// 第81条の４ 四国旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人普通旅客運賃

	// （1）営業キロが11キロメートルから100キロメートルまでの場合
	if totalGiseiKilo <= 15 {
		return 330, nil
	}
	if totalGiseiKilo <= 20 {
		return 430, nil
	}
	if totalGiseiKilo <= 25 {
		return 530, nil
	}
	if totalGiseiKilo <= 30 {
		return 630, nil
	}
	if totalGiseiKilo <= 35 {
		return 740, nil
	}
	if totalGiseiKilo <= 40 {
		return 850, nil
	}
	if totalGiseiKilo <= 45 {
		return 980, nil
	}
	if totalGiseiKilo <= 50 {
		return 1080, nil
	}
	if totalGiseiKilo <= 60 {
		return 1240, nil
	}
	if totalGiseiKilo <= 70 {
		return 1430, nil
	}
	if totalGiseiKilo <= 80 {
		return 1640, nil
	}
	if totalGiseiKilo <= 90 {
		return 1830, nil
	}
	if totalGiseiKilo <= 100 {
		return 2010, nil
	}

	// （2）営業キロが100キロメートルを超える場合
	splitKilo, err := calculateSplitKiloOfTrunk(totalGiseiKilo)
	if err != nil {
		return 0, err
	}
	if totalGiseiKilo <= 200 {
		return round1000(round10000(1920*splitKilo)*11/10) / 100, nil
	}
	if totalGiseiKilo <= 300 {
		return round1000(round10000(1920*200+1620*(splitKilo-200))*11/10) / 100, nil
	}
	if totalGiseiKilo <= 600 {
		return round1000(round10000(1920*200+1620*100+1285*(splitKilo-300))*11/10) / 100, nil
	}
	return round1000(round10000(1920*200+1620*100+1285*300+705*(splitKilo-600))*11/10) / 100, nil
}
