package usecase

import (
	"calculation-engine/internal/domain"
	"fmt"
)

// osakaCityDistanceDeduction は市内境界から山陽新幹線へ進む場合だけ、
// 中心駅から新大阪までの折り返し距離を控除する。京都方面には適用しない。
func (u *CalculateAmount) osakaCityDistanceDeduction(path []int) (domain.DeciKilo, domain.DeciKilo, error) {
	if len(path) < 3 {
		return 0, 0, nil
	}
	matches := func(a, b, c int) bool {
		return u.graph.GetName(a) == "大阪市内" && u.graph.GetName(b) == "新大阪" && u.graph.GetName(c) == "新神戸"
	}
	count := domain.DeciKilo(0)
	if matches(path[0], path[1], path[2]) {
		count++
	}
	n := len(path)
	if matches(path[n-1], path[n-2], path[n-3]) {
		count++
	}
	if count == 0 {
		return 0, 0, nil
	}
	osaka, ok := u.graph.GetID("大阪")
	shinOsaka, shinOK := u.graph.GetID("新大阪")
	if ok && shinOK {
		for _, edge := range u.graph.GetEdges(osaka) {
			if edge.ToID == shinOsaka && edge.Company == domain.JRWest {
				return 2 * count * edge.EigyoKilo, 2 * count * edge.GiseiKilo, nil
			}
		}
	}
	return 0, 0, fmt.Errorf("大阪市内の距離控除: 大阪・新大阪間の距離が見つかりません")
}

func (s *routeSummary) deductOsakaCityDistance(eigyo, gisei domain.DeciKilo) error {
	if eigyo == 0 && gisei == 0 {
		return nil
	}
	if eigyo < 0 || gisei < 0 || len(s.statsByCompany) <= int(domain.JRWest) {
		return fmt.Errorf("大阪市内の距離控除: 不正な集計")
	}
	west := &s.statsByCompany[domain.JRWest]
	if s.totalEigyo < eigyo || s.totalGisei < gisei || s.totalPathEigyo < eigyo || west.eigyo < eigyo || west.gisei < gisei {
		return fmt.Errorf("大阪市内の距離控除: 控除距離が集計距離を超えています")
	}
	s.totalEigyo -= eigyo
	s.totalGisei -= gisei
	s.totalPathEigyo -= eigyo
	west.eigyo -= eigyo
	west.gisei -= gisei
	return nil
}
