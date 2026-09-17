package domain

import (
	"fmt"

	basedomain "calculation-engine/internal/domain"
)

// BypassRuleDefinition は第69条等の特例区間を駅名で定義します。
type BypassRuleDefinition struct {
	ShortcutPath []string
	DetourPath   []string
}

// ResolvedBypassRule は駅IDに解決された特例区間です。
type ResolvedBypassRule struct {
	ShortcutPath []int
	DetourPath   []int
}

// BypassRegistry は特例区間のルールを管理します。
type BypassRegistry struct {
	definitions []BypassRuleDefinition
}

// NewBypassRegistry は新しい BypassRegistry を作成します。
func NewBypassRegistry() *BypassRegistry {
	return &BypassRegistry{}
}

// NewDefaultBypassRegistry は定期券計算で共通利用する特例区間を登録します。
func NewDefaultBypassRegistry() *BypassRegistry {
	registry := NewBypassRegistry()
	registry.Register(
		[]string{"大沼", "大沼公園", "赤井川", "駒ケ岳", "森"},
		[]string{"大沼", "鹿部", "渡島沼尻", "渡島砂原", "掛澗", "尾白内", "東森", "森"},
	)
	registry.Register(
		[]string{"日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽"},
		[]string{"日暮里", "尾久", "赤羽"},
	)
	registry.Register(
		[]string{"赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"},
		[]string{"赤羽", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "大宮"},
	)
	registry.Register(
		[]string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見"},
		[]string{"品川", "西大井", "武蔵小杉", "新川崎", "鶴見"},
	)
	return registry
}

// Register は新しい特例ルールを登録します。
func (r *BypassRegistry) Register(shortcut, detour []string) {
	r.definitions = append(r.definitions, BypassRuleDefinition{
		ShortcutPath: shortcut,
		DetourPath:   detour,
	})
}

// ResolveIDs は現在のグラフの駅IDを用いて、ID化されたルールの一覧を返します。
func (r *BypassRegistry) ResolveIDs(resolver func(string) (int, bool)) ([]ResolvedBypassRule, error) {
	resolved := make([]ResolvedBypassRule, 0, len(r.definitions))

	for _, def := range r.definitions {
		shortcut := make([]int, len(def.ShortcutPath))
		for i, name := range def.ShortcutPath {
			id, ok := resolver(name)
			if !ok {
				return nil, fmt.Errorf("%w: %s", basedomain.ErrStationNotFound, name)
			}
			shortcut[i] = id
		}

		detour := make([]int, len(def.DetourPath))
		for i, name := range def.DetourPath {
			id, ok := resolver(name)
			if !ok {
				return nil, fmt.Errorf("%w: %s", basedomain.ErrStationNotFound, name)
			}
			detour[i] = id
		}

		resolved = append(resolved, ResolvedBypassRule{
			ShortcutPath: shortcut,
			DetourPath:   detour,
		})
	}

	return resolved, nil
}
