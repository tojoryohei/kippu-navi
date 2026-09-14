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

func TestSpecialZoneApplierApplyPartialZone(t *testing.T) {
	tests := []struct {
		name       string
		stations   map[int]string
		path       []int
		originZone *ticketdomain.SpecialZone
		destZone   *ticketdomain.SpecialZone
		wantPath   []int
		wantThresh domain.DeciKilo
	}{
		{
			name: "両駅適用",
			stations: map[int]string{
				1:  "発駅",
				2:  "市外駅",
				3:  "着駅",
				10: "発ゾーン",
				11: "着ゾーン",
			},
			path: []int{1, 2, 3},
			originZone: &ticketdomain.SpecialZone{
				Name:                "発ゾーン",
				Stations:            []string{"発駅"},
				MinDistanceDeciKilo: 1000,
			},
			destZone: &ticketdomain.SpecialZone{
				Name:                "着ゾーン",
				Stations:            []string{"着駅"},
				MinDistanceDeciKilo: 2000,
			},
			wantPath:   []int{10, 1, 2, 3, 11},
			wantThresh: 2000,
		},
		{
			name: "着駅だけ成功する両駅候補",
			stations: map[int]string{
				1:  "発駅",
				2:  "発駅外1",
				3:  "発駅内2",
				4:  "発駅外2",
				5:  "着駅",
				11: "着ゾーン",
			},
			path: []int{1, 2, 3, 4, 5},
			originZone: &ticketdomain.SpecialZone{
				Name:                "発ゾーン",
				Stations:            []string{"発駅", "発駅内2"},
				MinDistanceDeciKilo: 1000,
			},
			destZone: &ticketdomain.SpecialZone{
				Name:                "着ゾーン",
				Stations:            []string{"着駅"},
				MinDistanceDeciKilo: 2000,
			},
			wantPath:   []int{1, 2, 3, 4, 5, 11},
			wantThresh: 2000,
		},
		{
			name: "発駅だけ成功する両駅候補",
			stations: map[int]string{
				1:  "発駅",
				2:  "発駅外",
				3:  "着駅内1",
				4:  "着駅外",
				5:  "着駅",
				10: "発ゾーン",
			},
			path: []int{1, 2, 3, 4, 5},
			originZone: &ticketdomain.SpecialZone{
				Name:                "発ゾーン",
				Stations:            []string{"発駅"},
				MinDistanceDeciKilo: 1000,
			},
			destZone: &ticketdomain.SpecialZone{
				Name:                "着ゾーン",
				Stations:            []string{"着駅内1", "着駅"},
				MinDistanceDeciKilo: 2000,
			},
			wantPath:   []int{10, 1, 2, 3, 4, 5},
			wantThresh: 1000,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			applier := usecase.NewSpecialZoneApplier(newMockGraph(tt.stations), nil)
			got, ok := applier.Apply(tt.path, tt.originZone, tt.destZone)
			if !ok {
				t.Fatal("ゾーン適用に失敗しました")
			}
			if !reflect.DeepEqual(got.TransformedPath, tt.wantPath) {
				t.Fatalf("変換後経路 = %v, want %v", got.TransformedPath, tt.wantPath)
			}
			if got.ThresholdKilo != tt.wantThresh {
				t.Fatalf("閾値 = %v, want %v", got.ThresholdKilo, tt.wantThresh)
			}
		})
	}
}

func TestSpecialZoneApplierModeBoundaries(t *testing.T) {
	tests := []struct {
		name      string
		zone      string
		stations  []string
		path      []string
		boldEdges int
		normal    []string
		uncorrect []string
	}{
		{"山手線内の出口は通常のみ70条範囲", "東京山手線内",
			[]string{"東京山手線内", "東京", "秋葉原"},
			[]string{"東京", "秋葉原", "錦糸町", "亀戸"}, 2,
			[]string{"東京山手線内", "錦糸町", "亀戸"},
			[]string{"東京山手線内", "秋葉原", "錦糸町", "亀戸"}},
		{"70条範囲内でも山手線内発着とはしない", "東京山手線内",
			[]string{"東京山手線内", "東京", "秋葉原"},
			[]string{"錦糸町", "亀戸", "平井"}, 1, nil, nil},
		{"東京都区内は既存の境界を維持", "東京都区内",
			[]string{"東京都区内", "東京", "秋葉原", "錦糸町", "亀戸"},
			[]string{"東京", "秋葉原", "錦糸町", "亀戸", "市川"}, 2,
			[]string{"東京都区内", "亀戸", "市川"},
			[]string{"東京都区内", "亀戸", "市川"}},
		{"尼崎通過特例は通常のみ", "大阪市内",
			[]string{"大阪市内", "加島", "塚本", "大阪"},
			[]string{"加島", "尼崎", "塚本", "大阪", "市外駅"}, 0,
			[]string{"大阪市内", "大阪", "市外駅"}, nil},
		{"久宝寺通過特例は通常のみ", "大阪市内",
			[]string{"大阪市内", "加美", "新加美", "放出"},
			[]string{"加美", "久宝寺", "新加美", "放出", "市外駅"}, 0,
			[]string{"大阪市内", "放出", "市外駅"}, nil},
	}
	for _, tt := range tests {
		for _, reverse := range []bool{false, true} {
			direction := "発駅"
			if reverse {
				direction = "着駅"
			}
			t.Run(tt.name+"/"+direction, func(t *testing.T) {
				g := graph.NewGraph(16)
				for _, name := range append(append([]string{}, tt.stations...), tt.path...) {
					g.GetOrAddID(name)
				}
				// 太線フラグを意図的に反転し、エッジではなく駅集合で判定することを確認します。
				for i := 0; i < len(tt.path)-1; i++ {
					from, _ := g.GetID(tt.path[i])
					to, _ := g.GetID(tt.path[i+1])
					g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: from, ToID: to}, IsBoldLineArea: i >= tt.boldEdges})
					g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: to, ToID: from}, IsBoldLineArea: i >= tt.boldEdges})
				}
				ids := func(names []string) []int {
					var result []int
					for _, name := range names {
						id, _ := g.GetID(name)
						result = append(result, id)
					}
					if reverse {
						for i, j := 0, len(result)-1; i < j; i, j = i+1, j-1 {
							result[i], result[j] = result[j], result[i]
						}
					}
					return result
				}
				zone := &ticketdomain.SpecialZone{Name: tt.zone, Stations: tt.stations, MinDistanceDeciKilo: 1000}
				origin, dest := zone, (*ticketdomain.SpecialZone)(nil)
				if reverse {
					origin, dest = dest, origin
				}
				applier := usecase.NewSpecialZoneApplier(g, nil)
				for _, uncorrect := range []bool{false, true} {
					apply, want := applier.Apply, tt.normal
					if uncorrect {
						apply, want = applier.ApplyUncorrect, tt.uncorrect
					}
					got, ok := apply(ids(tt.path), origin, dest)
					if ok != (want != nil) {
						t.Fatalf("uncorrect=%v: applied=%v, want=%v", uncorrect, ok, want != nil)
					}
					if ok && !reflect.DeepEqual(got.TransformedPath, ids(want)) {
						t.Fatalf("uncorrect=%v: got %v, want %v", uncorrect, got.TransformedPath, ids(want))
					}
				}
			})
		}
	}
}
