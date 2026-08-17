package fare

import (
	passdomain "calculation-engine/internal/pass/domain"
	"testing"
)

// TestPathMatcher_FalsePositive は人工的にハッシュ値が一致した状況を作り出し、
// slices.Equal による完全一致チェックが誤検知を防ぐことを検証します。
func TestPathMatcher_FalsePositive(t *testing.T) {
	matcher := NewPathMatcher()

	// 2つの異なる経路を用意
	route1 := []int{1, 2, 3}
	route2 := []int{10, 20, 30}

	// 登録済みの経路として route1 を手動で設定
	h1 := routeToPseudoFNV(route1)
	matcher.table[h1] = PathEntry{
		Path: route1,
		Fare:  passdomain.PassPrice{OneMonth: 100},
	}

	// route2 のハッシュ値で検索したときに、偶然 route1 のデータが登録されている状態をシミュレート
	h2 := routeToPseudoFNV(route2)
	matcher.table[h2] = PathEntry{
		Path: route1, // route2のハッシュバケットにroute1のデータが存在
		Fare:  passdomain.PassPrice{OneMonth: 100},
	}

	// route2 を検索。ハッシュ(h2)は見つかるが、内部のRouteはroute1なので false が返るべき
	if _, ok := matcher.Search(route2); ok {
		t.Error("ハッシュが一致しても経路が異なる場合に ok=true が返されました（False Positiveの誤検知）")
	}
}
