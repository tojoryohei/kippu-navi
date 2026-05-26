package fare

import (
	"errors"
	"fmt"
)

var (
	ErrInvalidRouteType = errors.New("不正なRouteTypeです")
	ErrInvalidTable     = errors.New("運賃表が不正です")
	ErrInvalidKilo      = errors.New("営業キロまたは運賃計算キロが0以下です")
	ErrInvalidMonths    = errors.New("不正な月数です（1, 3, 6のいずれかを指定してください）")
)

// calculateBaseFare は、幹線と地方交通線の運賃表を使い分ける本州・北海道向けの運賃計算ロジックです。
//
//nolint:unused
func calculateBaseFare(params PassFareParams, trunkTable, localTable *[101]PassFare) (int, error) {
	var targetKm int
	var useTrunkTable bool
	var err error

	switch params.RouteType {
	case RouteTypeTrunkOnly:
		targetKm, err = params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("calculateBaseFare: %w", err)
		}
		useTrunkTable = true
	case RouteTypeLocalOnly:
		targetKm, err = params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("calculateBaseFare: %w", err)
		}
		useTrunkTable = false
	case RouteTypeMixed:
		eigyoKm, err := params.EigyoKilo.ToCeiledKm()
		if err != nil {
			return 0, fmt.Errorf("calculateBaseFare: %w", err)
		}
		// 旅客営業規則第86条の特例：
		// 幹線・地方交通線を乗り通す場合でも、全区間の営業キロが10km以下であれば
		// 地方交通線の運賃表を適用する
		if eigyoKm <= 10 {
			targetKm = eigyoKm
			useTrunkTable = false
		} else {
			targetKm, err = params.GiseiKilo.ToCeiledKm()
			if err != nil {
				return 0, fmt.Errorf("calculateBaseFare: %w", err)
			}
			useTrunkTable = true
		}
	default:
		return 0, fmt.Errorf("calculateBaseFare: %w", ErrInvalidRouteType)
	}

	table := trunkTable
	if !useTrunkTable && localTable != nil {
		table = localTable
	}

	if table == nil {
		return 0, fmt.Errorf("calculateBaseFare: %w", ErrInvalidTable)
	}

	if targetKm <= 0 {
		return 0, fmt.Errorf("calculateBaseFare: %w", ErrInvalidKilo)
	}

	return calculateFromTable(targetKm, params.Months, table)
}

// calculateSingleTableFare は、常に擬制キロを使用し単一の運賃表を用いる九州・四国向けの運賃計算ロジックです。
//
//nolint:unused
func calculateSingleTableFare(params PassFareParams, table *[101]PassFare) (int, error) {
	targetKm, err := params.GiseiKilo.ToCeiledKm()
	if err != nil {
		return 0, fmt.Errorf("calculateSingleTableFare: %w", err)
	}
	return calculateFromTable(targetKm, params.Months, table)
}

// calculateFromTable は運賃表（100kmごとに折り返し）から月数に応じた運賃を抽出する純粋な計算処理です。
//
//nolint:unused
func calculateFromTable(targetKm int, months int, table *[101]PassFare) (int, error) {
	if table == nil {
		return 0, fmt.Errorf("calculateFromTable: %w", ErrInvalidTable)
	}

	if targetKm <= 0 {
		return 0, fmt.Errorf("calculateFromTable: %w", ErrInvalidKilo)
	}

	// 運賃表は100kmごとに折り返す構造のため、100の商と余りに分割する
	hundredsKm := targetKm / 100
	subHundredKm := targetKm % 100

	baseFare := table[100]
	remFare := table[subHundredKm]

	switch months {
	case 1:
		return (baseFare.OneMonth * hundredsKm) + remFare.OneMonth, nil
	case 3:
		return (baseFare.ThreeMonth * hundredsKm) + remFare.ThreeMonth, nil
	case 6:
		return (baseFare.SixMonth * hundredsKm) + remFare.SixMonth, nil
	default:
		return 0, fmt.Errorf("calculateFromTable: %w", ErrInvalidMonths)
	}
}
