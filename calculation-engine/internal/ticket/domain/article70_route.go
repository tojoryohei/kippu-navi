package domain

import (
	"encoding/json"
	"fmt"
)

// Article70Routes は70条特例の最短経路情報を保持します。
// Routes[exitStation][otherStation] という形式で保持します。
type Article70Routes struct {
	Routes map[string]map[string][]string
}

// NewArticle70Routes は新しい Article70Routes を生成します。
func NewArticle70Routes(routes map[string]map[string][]string) *Article70Routes {
	return &Article70Routes{
		Routes: routes,
	}
}

// GetRoute は指定されたモード（passing, from, to）と区間の最短経路を返します。
// 見つからない場合は nil を返します。
func (a *Article70Routes) GetRoute(mode string, startName, endName string) []string {
	if a.Routes == nil {
		return nil
	}

	// 経路を逆順にするヘルパー関数
	reverse := func(path []string) []string {
		if path == nil {
			return nil
		}
		rev := make([]string, len(path))
		for i, p := range path {
			rev[len(path)-1-i] = p
		}
		return rev
	}

	switch mode {
	case "from":
		// startが内部駅、endが出口駅
		if internalMap, ok := a.Routes[endName]; ok {
			if route, ok := internalMap[startName]; ok {
				return route
			}
		}
	case "to":
		// startが出口駅、endが内部駅
		if internalMap, ok := a.Routes[startName]; ok {
			if route, ok := internalMap[endName]; ok {
				// 出口から内部への経路なので逆順にする
				return reverse(route)
			}
		}
	case "passing":
		// startが出口駅、endも出口駅
		if internalMap, ok := a.Routes[endName]; ok {
			if route, ok := internalMap[startName]; ok {
				return route
			}
		}
		// 逆方向で登録されている場合
		if internalMap, ok := a.Routes[startName]; ok {
			if route, ok := internalMap[endName]; ok {
				return reverse(route)
			}
		}
	}
	return nil
}

// LoadArticle70RoutesFromBytes は JSON バイト列から Article70Routes を読み込みます。
func LoadArticle70RoutesFromBytes(data []byte) (*Article70Routes, error) {
	var routes map[string]map[string][]string
	if err := json.Unmarshal(data, &routes); err != nil {
		return nil, fmt.Errorf("LoadArticle70RoutesFromBytes: failed to unmarshal json: %w", err)
	}
	return &Article70Routes{Routes: routes}, nil
}
