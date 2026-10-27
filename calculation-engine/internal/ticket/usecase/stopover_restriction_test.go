package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/infra/graphio"
	"testing"
)

func TestCalculateStopoverRestriction(t *testing.T) {
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	g := &mockSuburbanGraph{edges: map[int][]ticketdomain.TicketEdge{
		1: {{Edge: domain.Edge{ToID: 2, Company: domain.JREast, SuburbanArea: domain.SuburbanAreaTokyo}}},
		2: {{Edge: domain.Edge{ToID: 3, Company: domain.Other}}},
		3: {{Edge: domain.Edge{ToID: 4, Company: domain.JREast, SuburbanArea: domain.SuburbanAreaTokyo}}},
		4: {{Edge: domain.Edge{ToID: 5, Company: domain.JREast}}},
	}}
	for _, tc := range []struct {
		name           string
		path           []int
		kilo           domain.DeciKilo
		from, to, want string
	}{
		{"私鉄を含む近郊区間が距離・都区市内に優先", []int{1, 2, 3, 4}, 2500, "東京都区内", "B", "下車前途無効"},
		{"近郊区間が山手線内に優先", []int{1, 2}, 1500, "東京山手線内", "B", "下車前途無効"},
		{"出発のみ都区市内", []int{4, 5}, 2500, "東京都区内", "B", "券面表示の都区市内各駅下車前途無効"},
		{"到着のみ都区市内", []int{4, 5}, 2500, "A", "大阪市内", "券面表示の都区市内各駅下車前途無効"},
		{"出発山手線内", []int{4, 5}, 1500, "東京山手線内", "B", "山手線内各駅下車前途無効"},
		{"到着山手線内", []int{4, 5}, 1500, "A", "東京山手線内", "山手線内各駅下車前途無効"},
		{"100km境界", []int{4, 5}, 1000, "A", "B", "下車前途無効"},
		{"100km超・所属駅でも制度未適用", []int{4, 5}, 1001, "東京", "B", ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := CalculateStopoverRestriction(tc.kilo, tc.path, g, zones, tc.from, tc.to); got != tc.want {
				t.Fatalf("途中下車制限 = %q、期待値 = %q", got, tc.want)
			}
		})
	}
}
