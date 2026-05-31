package domain

import (
	"errors"
	"fmt"
)

var (
	// ErrInvalidMonths は不正な月数が指定された場合のエラーです。
	ErrInvalidMonths = errors.New("不正な月数です（1, 3, 6のいずれかを指定してください）")
)

// RouteType は路線の種別（幹線、地方交通線など）を表します。
type RouteType int

const (
	RouteTypeTrunkOnly RouteType = iota // 幹線のみ
	RouteTypeLocalOnly                  // 地方交通線のみ
	RouteTypeMixed                      // 幹線と地方交通線をまたぐ
)

// DetermineRouteType は幹線・地方交通線の有無から RouteType を判定します。
func DetermineRouteType(hasTrunk, hasLocal bool) (RouteType, error) {
	if !hasTrunk && !hasLocal {
		return 0, errors.New("DetermineRouteType: 幹線も地方交通線も含まれていません")
	}
	if hasTrunk && hasLocal {
		return RouteTypeMixed, nil
	}
	if hasLocal {
		return RouteTypeLocalOnly, nil
	}
	return RouteTypeTrunkOnly, nil
}

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
		return 0, fmt.Errorf("domain: %w: %d", ErrInvalidMonths, months)
	}
}

// RouteAndFare は経路完全一致で適用される特定区間運賃や調整区間運賃を保持します。
type RouteAndFare struct {
	Route []string
	Fare  PassPrice
}

// PassFareParams は定期運賃計算の入力パラメータです。
type PassFareParams struct {
	RouteType RouteType
	EigyoKilo DeciKilo
	GiseiKilo DeciKilo
	Months    int
}
