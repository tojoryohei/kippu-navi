package integration

import (
	"split-pass-api/internal/graph/data"
	"split-pass-api/internal/infra/graphio"
	"split-pass-api/internal/usecase"
	"testing"
)

func TestGetViaStations_Integration(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフの読み込みに失敗: %v", err)
	}

	tests := []struct {
		name string
		path []string
		want []string
	}{
		{
			name: "東京から黒磯（東北線経由）",
			path: []string{"東京", "神田", "秋葉原", "御徒町", "上野", "鶯谷", "日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮", "土呂", "東大宮", "蓮田", "白岡", "新白岡", "久喜", "東鷲宮", "栗橋", "古河", "野木", "間々田", "小山", "小金井", "自治医大", "石橋", "雀宮", "宇都宮", "岡本", "宝積寺", "氏家", "蒲須坂", "片岡", "矢板", "（北）野崎", "西那須野", "那須塩原", "黒磯"},
			want: []string{"[近]東北", "王子", "尾久", "川口", "北赤羽", "土呂", "小金井", "岡本", "氏家"},
		},
		{
			name: "品川から横浜",
			path: []string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見", "新子安", "東神奈川", "横浜"},
			want: []string{"東海道線", "新子安", "東神奈川"},
		},
		{
			name: "越中島から神田",
			path: []string{"越中島", "八丁堀", "東京", "神田"},
			want: []string{"東京"},
		},
		{
			name: "神田から越中島",
			path: []string{"神田", "東京", "八丁堀", "越中島"},
			want: []string{"八丁堀"},
		},
		{
			name: "東京から神田",
			path: []string{"東京", "神田"},
			want: []string{},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			pathIDs := make([]int, len(tt.path))
			for i, p := range tt.path {
				id, ok := g.GetID(p)
				if !ok {
					t.Fatalf("駅が見つかりません: %s", p)
				}
				pathIDs[i] = id
			}

			vias := usecase.GetVia(g, pathIDs)
			t.Logf("[%s] 経由印字: %v", tt.name, vias)

			if len(vias) != len(tt.want) {
				t.Errorf("GetVia() returned %d elements, want %d. got: %v, want: %v", len(vias), len(tt.want), vias, tt.want)
			} else {
				for i, v := range vias {
					if v != tt.want[i] {
						t.Errorf("GetVia()[%d] = %s, want %s", i, v, tt.want[i])
					}
				}
			}
		})
	}
}
