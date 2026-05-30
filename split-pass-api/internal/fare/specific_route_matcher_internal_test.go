package fare

import (
	"split-pass-api/internal/domain"
	"testing"
)

// TestSpecificRouteMatcher_ActualCollision は人工的にハッシュ衝突を発生させ、
// slices.Equal による完全一致チェックが正しく機能することを検証します。
func TestSpecificRouteMatcher_ActualCollision(t *testing.T) {
	matcher := NewSpecificRouteMatcher()

	// 2つの異なる経路を用意
	route1 := []int{1, 2, 3}
	route2 := []int{10, 20, 30}

	// 人工的に衝突状態をシミュレートするため、同じハッシュ値のバケットに2つ登録する
	h := uint64(42)
	matcher.table[h] = []specificFareEntry{
		{Route: route1, Fare: domain.PassFare{OneMonth: 100}},
		{Route: route2, Fare: domain.PassFare{OneMonth: 200}},
	}

	// Search メソッドのテスト（ハッシュ値を強制的に指定できないため、
	// モック等を使わない限り、Search内部で計算されるハッシュと一致させる必要がある）
	// なので、Search関数の代わりに内部ロジックを直接呼ぶか、
	// routeToFNVInline が 42 を返すような入力を探すのは不可能なため、
	// 登録されている route1, route2 自体のハッシュを使う。

	h1 := routeToPseudoFNV(route1)
	matcher.table[h1] = []specificFareEntry{
		{Route: route1, Fare: domain.PassFare{OneMonth: 100}},
		{Route: route2, Fare: domain.PassFare{OneMonth: 200}}, // route1のハッシュにroute2を混ぜる
	}

	// 1. route1 を探す -> 見つかるはず
	if f, ok := matcher.Search(route1); !ok || f.OneMonth != 100 {
		t.Errorf("route1 (正規) の検索に失敗しました: ok=%v, fare=%v", ok, f.OneMonth)
	}

	// 2. route2 を探す
	// 通常は matcher.Search(route2) は routeToPseudoFNV(route2) のバケットを見に行く。
	// そこで、route2のハッシュバケットにも route1 を混ぜて「衝突」を再現する。
	h2 := routeToPseudoFNV(route2)
	matcher.table[h2] = []specificFareEntry{
		{Route: route1, Fare: domain.PassFare{OneMonth: 100}}, // route2のハッシュにroute1が混ざっている
		{Route: route2, Fare: domain.PassFare{OneMonth: 200}},
	}

	if f, ok := matcher.Search(route2); !ok || f.OneMonth != 200 {
		t.Errorf("route2 (衝突想定) の検索に失敗しました: ok=%v, fare=%v", ok, f.OneMonth)
	}

	// 3. 存在しない経路 (route1と同じハッシュだが中身が違う)
	matcher.table[h1] = append(matcher.table[h1], specificFareEntry{Route: []int{9, 9, 9}, Fare: domain.PassFare{OneMonth: 999}})
	if _, ok := matcher.Search([]int{1, 2, 4}); ok {
		t.Error("ハッシュが一致しても経路が異なる場合に ok=true が返されました")
	}
}
