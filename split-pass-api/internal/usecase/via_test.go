package usecase_test

import (
	"reflect"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/usecase"
	"testing"
)

func TestGetVia_Unit(t *testing.T) {
	g := graph.NewGraph(20)
	id := func(name string) int { return g.GetOrAddID(name) }

	// シンプルなグラフを作成
	g.AddEdge(domain.Edge{FromID: id("A"), ToID: id("B")})
	g.AddEdge(domain.Edge{FromID: id("B"), ToID: id("A")})
	g.AddEdge(domain.Edge{FromID: id("B"), ToID: id("C")})
	g.AddEdge(domain.Edge{FromID: id("C"), ToID: id("B")})
	g.AddEdge(domain.Edge{FromID: id("C"), ToID: id("D")})
	g.AddEdge(domain.Edge{FromID: id("D"), ToID: id("C")})
	g.AddEdge(domain.Edge{FromID: id("B"), ToID: id("E")})
	g.AddEdge(domain.Edge{FromID: id("E"), ToID: id("B")})

	tests := []struct {
		name string
		path []string
		want []string
	}{
		{
			name: "長さ2の経路",
			path: []string{"A", "B"},
			want: []string{}, // 長さ2以下の場合は空
		},
		{
			name: "分岐がない経路（デフォルトの経由）",
			path: []string{"C", "D", "X"},
			want: []string{"D"}, // 経由がない場合は stationNameList[1] が追加される
		},
		{
			name: "分岐駅を経由する一般的な経路",
			path: []string{"A", "B", "C", "D"},
			want: []string{"C"}, // Bの次数が3なので、stationNameList[i+1] である "C" が追加される
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pathIDs := make([]int, len(tt.path))
			for i, p := range tt.path {
				pathIDs[i] = id(p)
			}

			got := usecase.GetVia(g, pathIDs)

			if len(got) == 0 && len(tt.want) == 0 {
				return
			}

			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("GetVia() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestGetVia_SpecialRules_Unit(t *testing.T) {
	g := graph.NewGraph(20)
	id := func(name string) int { return g.GetOrAddID(name) }

	tests := []struct {
		name string
		path []string
		want []string
	}{
		{
			name: "東京〜神田〜秋葉原〜御徒町（東北特例）",
			path: []string{"東京", "神田", "秋葉原", "御徒町"},
			want: []string{"[近]東北"},
		},
		{
			name: "東京〜神田〜御茶ノ水〜水道橋（中央特例）",
			path: []string{"有楽町", "東京", "神田", "御茶ノ水", "水道橋"},
			want: []string{"[近]中央"},
		},
		{
			name: "浅草橋〜秋葉原〜御茶ノ水〜水道橋（総武特例）",
			path: []string{"浅草橋", "秋葉原", "御茶ノ水", "水道橋"},
			want: []string{"[近]総武"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pathIDs := make([]int, len(tt.path))
			for i, p := range tt.path {
				pathIDs[i] = id(p)
			}

			got := usecase.GetVia(g, pathIDs)
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("GetVia() = %v, want %v", got, tt.want)
			}
		})
	}
}
