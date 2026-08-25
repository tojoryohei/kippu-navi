package domain

import (
	basedomain "calculation-engine/internal/domain"
	"math"
)

// CalculateValidDaysFromKilo は営業キロ（デシキロ単位）から乗車券の有効日数を計算します。
// 100kmまでは1日、100kmを超える場合は200kmごとに1日加算されます。
func CalculateValidDaysFromKilo(eigyoKilo basedomain.DeciKilo) int {
	if eigyoKilo <= 1000 { // 100km
		return 1
	}
	return int(math.Ceil(float64(eigyoKilo)/2000.0)) + 1
}
