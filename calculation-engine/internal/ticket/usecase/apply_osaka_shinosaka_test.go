package usecase

import (
	"testing"
	"calculation-engine/internal/ticket/graph"
)

type mockGraph struct {
	graph.Graph
	names map[int]string
}

func (m *mockGraph) GetName(id int) string {
	return m.names[id]
}

func (m *mockGraph) GetID(name string) (int, bool) {
	for k, v := range m.names {
		if v == name {
			return k, true
		}
	}
	if name == "大阪・新大阪" {
		return 999, true
	}
	return -1, false
}

func TestApplyOsakaShinOsakaException(t *testing.T) {
	g := &mockGraph{
		names: map[int]string{
			1: "新大阪",
			2: "大阪",
			3: "尼崎",
			4: "姫路",
			5: "相生",
			6: "東姫路",
			7: "加古川",
			8: "和田山",
		},
	}

	tests := []struct {
		name       string
		path       []int
		wantApply  bool
	}{
		{
			name:      "新大阪から姫路以遠（相生）",
			path:      []int{1, 2, 3, 4, 5}, // 新大阪, 大阪, 尼崎, 姫路, 相生
			wantApply: true,
		},
		{
			name:      "姫路以遠（相生）から新大阪",
			path:      []int{5, 4, 3, 2, 1}, // 相生, 姫路, 尼崎, 大阪, 新大阪
			wantApply: true,
		},
		{
			name:      "新大阪から姫路まで",
			path:      []int{1, 2, 3, 4}, // 新大阪, 大阪, 尼崎, 姫路
			wantApply: true,
		},
		{
			name:      "姫路から新大阪まで",
			path:      []int{4, 3, 2, 1}, // 姫路, 尼崎, 大阪, 新大阪
			wantApply: true,
		},
		{
			name:      "新大阪から姫路を通って逆方向（東姫路）",
			path:      []int{1, 8, 4, 6}, // 新大阪, 和田山, 姫路, 東姫路
			wantApply: false,
		},
		{
			name:      "逆方向から姫路を通って新大阪（東姫路 -> 姫路 -> 和田山 -> 新大阪）",
			path:      []int{6, 4, 8, 1}, // 東姫路, 姫路, 和田山, 新大阪
			wantApply: false,
		},
		{
			name:      "姫路を含まない経路",
			path:      []int{1, 2, 3}, // 新大阪, 大阪, 尼崎
			wantApply: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, applied := ApplyOsakaShinOsakaException(tt.path, g)
			if applied != tt.wantApply {
				t.Errorf("got %v, want %v", applied, tt.wantApply)
			}
		})
	}
}
