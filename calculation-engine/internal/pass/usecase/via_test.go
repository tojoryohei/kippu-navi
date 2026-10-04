package usecase_test

import (
	"calculation-engine/internal/domain"
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"calculation-engine/internal/pass/usecase"
	"reflect"
	"testing"
)

func TestGetVia_Unit(t *testing.T) {
	g := graph.NewGraph(20)
	id := func(name string) int { return g.GetOrAddID(name) }

	// シンプルなグラフを作成
	g.AddEdge(passdomain.PassEdge{Line: "トウホ", Edge: domain.Edge{FromID: id("A"), ToID: id("B")}})
	g.AddEdge(passdomain.PassEdge{Line: "トウホ", Edge: domain.Edge{FromID: id("B"), ToID: id("A")}})
	g.AddEdge(passdomain.PassEdge{Line: "トウホ", Edge: domain.Edge{FromID: id("B"), ToID: id("C")}})
	g.AddEdge(passdomain.PassEdge{Line: "トウホ", Edge: domain.Edge{FromID: id("C"), ToID: id("B")}})
	g.AddEdge(passdomain.PassEdge{Line: "トウホ", Edge: domain.Edge{FromID: id("C"), ToID: id("D")}})
	g.AddEdge(passdomain.PassEdge{Line: "トウホ", Edge: domain.Edge{FromID: id("D"), ToID: id("C")}})
	g.AddEdge(passdomain.PassEdge{Line: "チユト", Edge: domain.Edge{FromID: id("B"), ToID: id("E")}})
	g.AddEdge(passdomain.PassEdge{Line: "チユト", Edge: domain.Edge{FromID: id("E"), ToID: id("B")}})

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
			want: []string{"C"}, // Bには異なる路線コードが2種類あるので、stationNameList[i+1] である "C" が追加される
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

func TestGetVia_JunctionUsesDistinctLines(t *testing.T) {
	for _, tt := range []struct {
		name   string
		lines  []string
		branch string
		want   []string
	}{
		{"次数3でも同一路線", []string{"トウホ", "トウホ", "トウホ"}, "トウホ", []string{"B"}},
		{"次数2でも2路線", []string{"トウホ", "チユト", "チユト"}, "", []string{"C"}},
		{"終点直前だけが2路線", []string{"トウホ", "トウホ", "チユト"}, "トウホ", []string{"C"}},
		{"前駅も2路線なら終点直前の追加を省く", []string{"トウホ", "チユト", "トウホ"}, "", []string{"C"}},
	} {
		t.Run(tt.name, func(t *testing.T) {
			g := graph.NewGraph(5)
			ids := make([]int, 5)
			for i, name := range []string{"A", "B", "C", "D", "E"} {
				ids[i] = g.GetOrAddID(name)
			}
			add := func(a, b int, line string) {
				g.AddEdge(passdomain.PassEdge{Edge: domain.Edge{FromID: ids[a], ToID: ids[b]}, Line: line})
				g.AddEdge(passdomain.PassEdge{Edge: domain.Edge{FromID: ids[b], ToID: ids[a]}, Line: line})
			}
			for i, line := range tt.lines {
				add(i, i+1, line)
			}
			if tt.branch != "" {
				add(1, 4, tt.branch)
			}
			if got := usecase.GetVia(g, ids[:4]); !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("GetVia()=%v, want %v", got, tt.want)
			}
		})
	}
}
