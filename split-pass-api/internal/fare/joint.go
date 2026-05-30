package fare

import (
	"fmt"
	"split-pass-api/internal/domain"
)

// JointFareComponent は各社ごとの乗車統計を保持します
type JointFareComponent struct {
	CompanyID domain.CompanyID
	RouteType domain.RouteType
	EigyoKilo domain.DeciKilo
	GiseiKilo domain.DeciKilo
}

// CalculateJointFare は会社跨ぎの運賃計算ルール（差額加算方式）を適用します。
// 1. 全区間を通算キロで Standard 運賃計算
// 2. 各社ごとに (自社運賃 - Standard運賃) を加算
func CalculateJointFare(r *Registry, totalEigyo, totalGisei domain.DeciKilo, totalRouteType domain.RouteType, components []JointFareComponent, months int) (int, error) {
	standardCalc, err := r.Get(domain.JRCentral)
	if err != nil {
		return 0, fmt.Errorf("joint_fare: standardの運賃計算機が見つかりません: %w", err)
	}

	// 1. 基準運賃（全区間 Standard）
	baseParams := domain.PassFareParams{
		RouteType: totalRouteType,
		EigyoKilo: totalEigyo,
		GiseiKilo: totalGisei,
		Months:    months,
	}
	totalFare, err := standardCalc.Calculate(baseParams)
	if err != nil {
		return 0, fmt.Errorf("joint_fare: 基準運賃の計算に失敗しました: %w", err)
	}

	// 2. 他社差額の加算
	for _, comp := range components {
		if comp.CompanyID == domain.JRCentral || comp.CompanyID == domain.JRWest {
			continue
		}

		otherCalc, err := r.Get(comp.CompanyID)
		if err != nil {
			return 0, err
		}

		compParams := domain.PassFareParams{
			RouteType: comp.RouteType,
			EigyoKilo: comp.EigyoKilo,
			GiseiKilo: comp.GiseiKilo,
			Months:    months,
		}

		otherFare, err := otherCalc.Calculate(compParams)
		if err != nil {
			return 0, err
		}

		stdFareForComp, err := standardCalc.Calculate(compParams)
		if err != nil {
			return 0, err
		}

		diff := otherFare - stdFareForComp
		if diff < 0 {
			return 0, fmt.Errorf("joint_fare: 会社 %d の差額計算が不正です: 他社運賃(%d) < 基準運賃(%d)", comp.CompanyID, otherFare, stdFareForComp)
		}

		totalFare += diff
	}

	return totalFare, nil
}
