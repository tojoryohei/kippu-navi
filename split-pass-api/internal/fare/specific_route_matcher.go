package fare

import (
	"errors"
	"fmt"
	"slices"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
)

var (
	// ErrDuplicateRoute は既に同じ経路が登録されている場合のエラーです。
	ErrDuplicateRoute = errors.New("指定された経路は既に登録されています")
)

// specificFareEntry は特定の経路とそれに紐づく運賃を保持します。
type specificFareEntry struct {
	Route []int
	Fare  domain.PassFare
}

// SpecificRouteMatcher は経路の完全一致による特定運賃を検索・適用します。
// HashMap (FNV-1a) と slices.Equal を用いた Two-Phase Lookup により、
// 高速かつ安全（衝突耐性あり）な検索を実現します。
type SpecificRouteMatcher struct {
	table map[uint64][]specificFareEntry
}

// NewSpecificRouteMatcher は新しい SpecificRouteMatcher を初期化します。
func NewSpecificRouteMatcher() *SpecificRouteMatcher {
	return &SpecificRouteMatcher{
		table: make(map[uint64][]specificFareEntry),
	}
}

// routeToPseudoFNV はアロケーションなしで []int のハッシュ値を計算します。
// FNV-1a の定数を使用していますが、バイト単位ではなく int 単位で XOR するため
// 厳密には FNV-1a ではありません。標準実装より約8倍高速です。
func routeToPseudoFNV(route []int) uint64 {
	var h uint64 = 14695981039346656037 // FNV offset basis
	for _, id := range route {
		h ^= uint64(id)
		h *= 1099511628211 // FNV prime
	}
	return h
}

// LoadFromDomain は JSON からロードしたドメインモデルの配列と Graph (名前解決用) を用いてデータを構築します。
func (m *SpecificRouteMatcher) LoadFromDomain(fares []domain.SpecificRouteFare, g *graph.Graph) error {
	m.table = make(map[uint64][]specificFareEntry, len(fares)*2)
	for _, sf := range fares {
		route := make([]int, len(sf.Route))
		for i, name := range sf.Route {
			id, ok := g.GetID(name)
			if !ok {
				return fmt.Errorf("特定区間運賃に含まれる駅 '%s' がグラフに見つかりません", name)
			}
			route[i] = id
		}
		if err := m.Insert(route, sf.Fare); err != nil {
			return fmt.Errorf("特定区間運賃のロードに失敗しました (route: %v): %w", sf.Route, err)
		}
	}
	return nil
}

// Insert は経路と運賃をマップに登録します。
// 既に同じ経路が登録されている場合は ErrDuplicateRoute を返します。
// 逆方向からの検索にも対応するため、逆順の経路も同時に登録します。
func (m *SpecificRouteMatcher) Insert(route []int, fare domain.PassFare) error {
	// 重複チェック
	if _, ok := m.Search(route); ok {
		return ErrDuplicateRoute
	}

	// スライスのコピーを作成して保持する（外部からの変更を防ぐ）
	routeCopy := make([]int, len(route))
	copy(routeCopy, route)

	hash := routeToPseudoFNV(routeCopy)
	m.table[hash] = append(m.table[hash], specificFareEntry{
		Route: routeCopy,
		Fare:  fare,
	})

	// 逆方向の経路も登録
	rev := make([]int, len(routeCopy))
	for i := 0; i < len(routeCopy); i++ {
		rev[i] = routeCopy[len(routeCopy)-1-i]
	}
	revHash := routeToPseudoFNV(rev)

	// 双方向で同じ配列の場合は重複登録を避ける
	if slices.Equal(routeCopy, rev) {
		return nil
	}

	// 逆方向の重複チェック
	if _, ok := m.Search(rev); ok {
		return ErrDuplicateRoute
	}

	m.table[revHash] = append(m.table[revHash], specificFareEntry{
		Route: rev,
		Fare:  fare,
	})
	return nil
}

// Search は指定された経路に完全に一致する特定区間運賃があるか検索します。
func (m *SpecificRouteMatcher) Search(route []int) (domain.PassFare, bool) {
	if m.table == nil {
		return domain.PassFare{}, false
	}
	hash := routeToPseudoFNV(route)
	entries, ok := m.table[hash]
	if !ok {
		return domain.PassFare{}, false
	}

	// ハッシュが一致したエントリの中から、スライスが完全に一致するものを探す（衝突対策）
	for _, entry := range entries {
		if slices.Equal(entry.Route, route) {
			return entry.Fare, true
		}
	}

	return domain.PassFare{}, false
}
