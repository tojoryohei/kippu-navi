package domain

import (
	"fmt"

	basedomain "calculation-engine/internal/domain"
)

// PassPrice は各月数（1, 3, 6ヶ月）の定期運賃を保持します。
type PassPrice struct {
	OneMonth   int
	ThreeMonth int
	SixMonth   int
}

// GetByMonths は指定された月数の運賃を返します。
func (f PassPrice) GetByMonths(months int) (int, error) {
	switch months {
	case 1:
		return f.OneMonth, nil
	case 3:
		return f.ThreeMonth, nil
	case 6:
		return f.SixMonth, nil
	default:
		return 0, fmt.Errorf("domain: %w: %d", basedomain.ErrInvalidMonths, months)
	}
}

// RouteAndFare は経路完全一致で適用される特定区間運賃や調整区間運賃を保持します。
type RouteAndFare struct {
	Route []string
	Fare  PassPrice
}

// PassFareParams は定期運賃計算の入力パラメータです。
type PassFareParams struct {
	RouteType basedomain.RouteType
	EigyoKilo basedomain.DeciKilo
	GiseiKilo basedomain.DeciKilo
	Months    int
}
