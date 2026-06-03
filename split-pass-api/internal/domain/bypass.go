package domain

import "fmt"

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
				return nil, fmt.Errorf("%w: %s", ErrStationNotFound, name)
			}
			shortcut[i] = id
		}

		detour := make([]int, len(def.DetourPath))
		for i, name := range def.DetourPath {
			id, ok := resolver(name)
			if !ok {
				return nil, fmt.Errorf("%w: %s", ErrStationNotFound, name)
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
