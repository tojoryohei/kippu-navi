package usecase_test

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"reflect"
	"testing"
)

// モック用のグラフ実装
// GetName と GetID だけを提供するシンプルなモックです。
type mockGraph struct {
	graph.Graph // インターフェースを満たすための埋め込み
	idToName    map[int]string
	nameToID    map[string]int
}

func newMockGraph(stations map[int]string) *mockGraph {
	m := &mockGraph{
		idToName: stations,
		nameToID: make(map[string]int),
	}
	for id, name := range stations {
		m.nameToID[name] = id
	}
	return m
}

func (m *mockGraph) GetName(id int) string {
	return m.idToName[id]
}

func (m *mockGraph) GetID(name string) (int, bool) {
	id, ok := m.nameToID[name]
	return id, ok
}

func TestSpecialZoneApplier_Apply(t *testing.T) {
	// テスト用の駅定義（IDと駅名のマッピング）
	stations := map[int]string{
		1:  "新宿",
		2:  "品川",
		3:  "新横浜",
		4:  "小田原",
		5:  "東京都区内",
		6:  "天王寺",
		7:  "大阪",
		8:  "塚本",
		9:  "尼崎",
		10: "神戸",
		11: "大阪市内",
	}
	mockG := newMockGraph(stations)

	mockReg := &graphio.SpecialZoneRegistry{
		Zones: []ticketdomain.SpecialZone{
			{Name: "東京都区内", Stations: []string{"東京", "品川", "新宿", "池袋", "上野"}},
		},
	}
	applier := usecase.NewSpecialZoneApplier(mockG, mockReg)

	tests := []struct {
		name       string
		path       []int                     // 入力経路の駅ID配列
		originZone *ticketdomain.SpecialZone // 出発地の特例ゾーン（適用しない場合は nil）
		destZone   *ticketdomain.SpecialZone // 到着地の特例ゾーン（適用しない場合は nil）
		wantPath   []int                     // 期待される置換後の駅ID配列
		wantThresh domain.DeciKilo           // 期待される閾値（例: 200km超なら2000）
		wantOk     bool                      // 適用が成功するかどうか
	}{
		{
			name: "東京から出るケース（出口駅が含まれないことの確認）",
			// 新宿(1) -> 品川(2) -> 新横浜(3) -> 小田原(4)
			path: []int{1, 2, 3, 4},
			originZone: &ticketdomain.SpecialZone{
				Name:                "東京都区内",
				Stations:            []string{"新宿", "品川", "東京"},
				MinDistanceDeciKilo: 2000,
			},
			destZone: nil,
			// 期待結果: 東京都区内(5) -> 品川(2) -> 新横浜(3) -> 小田原(4)
			wantPath:   []int{5, 2, 3, 4},
			wantThresh: 2000,
			wantOk:     true,
		},
		{
			name: "大阪から出るケース（出口駅が含まれることの確認）",
			// 天王寺(6) -> 大阪(7) -> 塚本(8) -> 尼崎(9) -> 神戸(10)
			path: []int{6, 7, 8, 9, 10},
			originZone: &ticketdomain.SpecialZone{
				Name:                "大阪市内",
				Stations:            []string{"天王寺", "大阪", "塚本"},
				MinDistanceDeciKilo: 2000,
			},
			destZone: nil,
			// 期待結果: 大阪市内(11) -> 塚本(8) -> 尼崎(9) -> 神戸(10)
			wantPath:   []int{11, 8, 9, 10},
			wantThresh: 2000,
			wantOk:     true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotInfo, gotOk := applier.Apply(tt.path, tt.originZone, tt.destZone)

			if gotOk != tt.wantOk {
				t.Errorf("Apply() gotOk = %v, want %v", gotOk, tt.wantOk)
				return
			}

			if !gotOk {
				return
			}

			if !reflect.DeepEqual(gotInfo.TransformedPath, tt.wantPath) {
				t.Errorf("Apply() gotPath = %v, want %v", gotInfo.TransformedPath, tt.wantPath)
			}
			if gotInfo.ThresholdKilo != tt.wantThresh {
				t.Errorf("Apply() gotThresh = %v, want %v", gotInfo.ThresholdKilo, tt.wantThresh)
			}
		})
	}
}
