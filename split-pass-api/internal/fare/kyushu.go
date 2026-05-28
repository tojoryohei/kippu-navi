package fare

import (
	_ "embed"
	"encoding/json"
	"errors"
	"fmt"
)

//go:embed data/kyushuFares.json
var kyushuFaresJSON []byte

// errNoSpecialFare は九州の特定定期運賃の適用対象外であることを示すセンチネルエラーです。
// 外部には公開せず、getKyushuSpecificFare と Calculate の間でのみ使います。
var errNoSpecialFare = errors.New("九州の特定定期運賃の適用対象外")

func NewKyushuCalculator() (*KyushuCalculator, error) {
	var kyushuFares [101]PassFare
	if err := json.Unmarshal(kyushuFaresJSON, &kyushuFares); err != nil {
		return nil, fmt.Errorf("kyushuFaresの読み込みに失敗しました: %w", err)
	}
	return &KyushuCalculator{fares: kyushuFares}, nil
}

// getKyushuSpecificFare は九州の特定定期運賃を返します。
// 適用対象外の場合は errNoSpecialFare を返します。
func getKyushuSpecificFare(params PassFareParams) (int, error) {
	g, err := params.GiseiKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("getKyushuSpecificFare: %w", err)
	}
	e, err := params.EigyoKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("getKyushuSpecificFare: %w", err)
	}
	m := params.Months

	if params.RouteType == RouteTypeLocalOnly {
		switch {
		case g == 4 && e == 3:
			return extractMonthFare(PassFare{OneMonth: 7130, ThreeMonth: 20440, SixMonth: 36200}, m)
		case g == 11:
			return extractMonthFare(PassFare{OneMonth: 10230, ThreeMonth: 29430, SixMonth: 50290}, m)
		case g == 16:
			return extractMonthFare(PassFare{OneMonth: 11470, ThreeMonth: 33010, SixMonth: 57030}, m)
		case g == 17 && e == 15:
			return extractMonthFare(PassFare{OneMonth: 11530, ThreeMonth: 33200, SixMonth: 58090}, m)
		case g == 21:
			return extractMonthFare(PassFare{OneMonth: 15300, ThreeMonth: 44030, SixMonth: 78260}, m)
		case g == 22:
			return extractMonthFare(PassFare{OneMonth: 15360, ThreeMonth: 44210, SixMonth: 78380}, m)
		case g == 26 && e == 23:
			return extractMonthFare(PassFare{OneMonth: 19210, ThreeMonth: 55250, SixMonth: 97870}, m)
		case g == 31 && e == 28:
			return extractMonthFare(PassFare{OneMonth: 23010, ThreeMonth: 66230, SixMonth: 117290}, m)
		case g == 36 && e == 32:
			return extractMonthFare(PassFare{OneMonth: 27120, ThreeMonth: 78090, SixMonth: 138280}, m)
		case g == 41 && e == 37:
			// 仕様：6ヶ月のみ特殊運賃。1・3ヶ月は通常テーブルを適用する。
			if m == 6 {
				return 157980, nil
			}
		case g == 46 && e == 41:
			// 仕様：6ヶ月のみ特殊運賃。1・3ヶ月は通常テーブルを適用する。
			if m == 6 {
				return 179510, nil
			}
		}
	}

	if params.RouteType == RouteTypeMixed {
		switch {
		case g == 4 && e == 3:
			return extractMonthFare(PassFare{OneMonth: 7130, ThreeMonth: 20440, SixMonth: 36200}, m)
		case g == 11 && e == 10:
			return extractMonthFare(PassFare{OneMonth: 10230, ThreeMonth: 29430, SixMonth: 50290}, m)
		}
	}

	return 0, errNoSpecialFare
}

func extractMonthFare(fare PassFare, months int) (int, error) {
	switch months {
	case 1:
		return fare.OneMonth, nil
	case 3:
		return fare.ThreeMonth, nil
	case 6:
		return fare.SixMonth, nil
	default:
		return 0, fmt.Errorf("extractMonthFare: %w", ErrInvalidMonths)
	}
}

type KyushuCalculator struct {
	fares [101]PassFare
}

func (c *KyushuCalculator) Calculate(params PassFareParams) (int, error) {
	fare, err := getKyushuSpecificFare(params)
	switch {
	case err == nil:
		// 特定定期運賃が適用された
		return fare, nil
	case errors.Is(err, errNoSpecialFare):
		// 適用対象外 → 通常テーブルで計算
		return calculateSingleTableFare(params, &c.fares)
	default:
		// 距離変換などの実エラー
		return 0, fmt.Errorf("KyushuCalculator.Calculate: %w", err)
	}
}
