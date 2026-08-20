package fare

import (
	"calculation-engine/internal/domain"
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"errors"
	"fmt"
	"slices"
)

var (
	// ErrDuplicateRoute は既に同じ経路が登録されている場合のエラーです。
	ErrDuplicateRoute = errors.New("指定された経路は既に登録されています")
	// ErrHashCollision は異なる経路で同じハッシュ値が生成された場合のエラーです。
	ErrHashCollision = errors.New("ハッシュ値が衝突しています")
)

// PathEntry は特定の経路とそれに紐づく運賃を保持します。
type PathEntry struct {
	Path []int
	Fare passdomain.PassPrice
}

// PathMatcher は経路の完全一致による特定運賃を検索・適用します。
// HashMap (FNV-1a) と slices.Equal を用いた Two-Phase Lookup により、
// 高速かつ安全（衝突耐性あり）な検索を実現します。
type PathMatcher struct {
	table map[uint64]PathEntry
}

// NewPathMatcher は新しい PathMatcher を初期化します。
func NewPathMatcher() *PathMatcher {
	return &PathMatcher{
		table: make(map[uint64]PathEntry),
	}
}

// routeToPseudoFNV はアロケーションなしで []int のハッシュ値を計算します。
// FNV-1a の定数を使用していますが、バイト単位ではなく int 単位で XOR するため
// 厳密には FNV-1a ではありません。標準実装より約8倍高速です。
func routeToPseudoFNV(path []int) uint64 {
	var h uint64 = 14695981039346656037 // FNV offset basis
	for _, id := range path {
		h ^= uint64(id)
		h *= 1099511628211 // FNV prime
	}
	return h
}

// LoadFromDomainWithOptions は JSON からロードしたデータを用いて構築しますが、ignoreMissing が true の場合は駅名解決に失敗した経路をスキップします。
func (m *PathMatcher) LoadFromDomainWithOptions(path_and_fares []passdomain.PathAndFare, g graph.Graph, ignoreMissing bool) error {
	if g == nil {
		return fmt.Errorf("LoadFromDomain: %w", graph.ErrInvalidGraph)
	}

	m.table = make(map[uint64]PathEntry, len(path_and_fares)*2)
	for _, sf := range path_and_fares {
		path := make([]int, len(sf.Path))
		skip := false
		for i, name := range sf.Path {
			id, ok := g.GetID(name)
			if !ok {
				if ignoreMissing {
					skip = true
					break
				}
				return fmt.Errorf("LoadFromDomain: %w: %s", domain.ErrStationNotFound, name)
			}
			path[i] = id
		}
		if skip {
			continue
		}
		if err := m.Insert(path, sf.Fare); err != nil {
			return fmt.Errorf("LoadFromDomain: データの登録に失敗しました (path: %v): %w", sf.Path, err)
		}
	}
	return nil
}

// LoadFromDomain は JSON からロードしたドメインモデルの配列と Graph (名前解決用) を用いてデータを構築します。
func (m *PathMatcher) LoadFromDomain(path_and_fares []passdomain.PathAndFare, g graph.Graph) error {
	return m.LoadFromDomainWithOptions(path_and_fares, g, false)
}

// Insert は経路と運賃をマップに登録します。
// 既に同じ経路が登録されている場合は ErrDuplicateRoute を返します。
// 逆方向からの検索にも対応するため、逆順の経路も同時に登録します。
func (m *PathMatcher) Insert(path []int, fare passdomain.PassPrice) error {
	// 重複チェック
	if _, ok := m.Search(path); ok {
		return ErrDuplicateRoute
	}

	// スライスのコピーを作成して保持する（外部からの変更を防ぐ）
	routeCopy := make([]int, len(path))
	copy(routeCopy, path)

	hash := routeToPseudoFNV(routeCopy)
	if _, ok := m.table[hash]; ok {
		return fmt.Errorf("PathMatcher: %w (hash=%d, new path=%v)", ErrHashCollision, hash, routeCopy)
	}
	m.table[hash] = PathEntry{
		Path: routeCopy,
		Fare: fare,
	}

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

	if _, ok := m.table[revHash]; ok {
		return fmt.Errorf("PathMatcher: %w (reverse) (hash=%d, new path=%v)", ErrHashCollision, revHash, rev)
	}
	m.table[revHash] = PathEntry{
		Path: rev,
		Fare: fare,
	}
	return nil
}

// Search は指定された経路に完全に一致する特定区間運賃があるか検索します。
func (m *PathMatcher) Search(path []int) (passdomain.PassPrice, bool) {
	if m.table == nil {
		return passdomain.PassPrice{}, false
	}
	hash := routeToPseudoFNV(path)
	entry, ok := m.table[hash]
	if !ok {
		return passdomain.PassPrice{}, false
	}

	// ハッシュが一致したエントリに対して、スライスが完全に一致するかを確認する（未登録経路によるFalse Positive対策）
	if slices.Equal(entry.Path, path) {
		return entry.Fare, true
	}

	return passdomain.PassPrice{}, false
}
