package domain

import (
	"fmt"
)

type addonDefinition struct {
	StationA string
	StationB string
	Fare     PassPrice
}

type stationPairKey struct {
	lo, hi int
}

func makePairKey(id1, id2 int) stationPairKey {
	if id1 <= id2 {
		return stationPairKey{lo: id1, hi: id2}
	}
	return stationPairKey{lo: id2, hi: id1}
}

// AddonRegistry は特定区間の加算運賃を管理します。
type AddonRegistry struct {
	definitions []addonDefinition
	resolved    map[stationPairKey]PassPrice
	// 関西空港線の重複判定用（旅客営業規則に基づく特殊対応）
	hinenoID int
	rinkuuID int
	kansaiID int
}

// NewAddonRegistry は空の AddonRegistry を作成します。
func NewAddonRegistry() *AddonRegistry {
	return &AddonRegistry{
		definitions: make([]addonDefinition, 0),
		resolved:    make(map[stationPairKey]PassPrice),
		hinenoID:    -1,
		rinkuuID:    -1,
		kansaiID:    -1,
	}
}

// Register は特定の駅名ペアに対する加算運賃を登録します。
func (r *AddonRegistry) Register(stationA, stationB string, fare PassPrice) {
	r.definitions = append(r.definitions, addonDefinition{
		StationA: stationA,
		StationB: stationB,
		Fare:     fare,
	})
}

// ResolveIDs は現在のグラフの駅IDを用いて、高速検索用のマップを構築します。
func (r *AddonRegistry) ResolveIDs(resolver func(string) (int, bool)) error {
	r.resolved = make(map[stationPairKey]PassPrice, len(r.definitions))

	// 特殊判定用の駅IDを解決
	r.hinenoID, _ = resolver("日根野")
	r.rinkuuID, _ = resolver("りんくうタウン")
	r.kansaiID, _ = resolver("関西空港")

	for _, def := range r.definitions {
		idA, okA := resolver(def.StationA)
		if !okA {
			return fmt.Errorf("%w: %s", ErrStationNotFound, def.StationA)
		}
		idB, okB := resolver(def.StationB)
		if !okB {
			return fmt.Errorf("%w: %s", ErrStationNotFound, def.StationB)
		}
		if idA == idB {
			return fmt.Errorf("%w: %s", ErrSameStation, def.StationA)
		}
		key := makePairKey(idA, idB)
		r.resolved[key] = def.Fare
	}
	return nil
}

// Lookup は指定された駅ID間に加算運賃が設定されているか確認し、あればその運賃を返します。
func (r *AddonRegistry) Lookup(id1, id2 int) (PassPrice, bool) {
	key := makePairKey(id1, id2)
	fare, ok := r.resolved[key]
	return fare, ok
}

// GetApplicableAddons は経路全体から適用すべき加算運賃を抽出します。
// 関西空港線などの特殊な重複ルールは、旅客営業規則に基づき明示的に判定します。
func (r *AddonRegistry) GetApplicableAddons(path []int) []PassPrice {
	if len(path) < 2 {
		return nil
	}

	// 経路に含まれる駅IDのセットを構築 (ユーザー提案のアルゴリズム)
	stationSet := make(map[int]struct{}, len(path))
	for _, id := range path {
		stationSet[id] = struct{}{}
	}

	var result []PassPrice

	// 1. 関西空港線の判定 (旅客営業規則に基づく重複適用防止)
	_, hasHineno := stationSet[r.hinenoID]
	_, hasRinkuu := stationSet[r.rinkuuID]
	_, hasKansai := stationSet[r.kansaiID]

	keyH_K := makePairKey(r.hinenoID, r.kansaiID)
	keyH_R := makePairKey(r.hinenoID, r.rinkuuID)
	keyR_K := makePairKey(r.rinkuuID, r.kansaiID)

	switch {
	case hasHineno && hasKansai:
		// 日根野〜関西空港 通しの加算運賃を優先適用
		if f, ok := r.resolved[keyH_K]; ok {
			result = append(result, f)
		}
	case hasHineno && hasRinkuu:
		// 日根野〜りんくうタウンのみ
		if f, ok := r.resolved[keyH_R]; ok {
			result = append(result, f)
		}
	case hasRinkuu && hasKansai:
		// りんくうタウン〜関西空港のみ
		if f, ok := r.resolved[keyR_K]; ok {
			result = append(result, f)
		}
	}

	// 2. その他の加算運賃の判定
	for key, fare := range r.resolved {
		if key == keyH_K || key == keyH_R || key == keyR_K {
			continue
		}

		_, ok1 := stationSet[key.lo]
		_, ok2 := stationSet[key.hi]
		if ok1 && ok2 {
			result = append(result, fare)
		}
	}

	return result
}
