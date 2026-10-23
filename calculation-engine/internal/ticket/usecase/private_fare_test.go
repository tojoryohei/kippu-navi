package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/fareio"
	"strings"
	"testing"
)

func TestPrivateFareCompanyIdentityAndErrors(t *testing.T) {
	reg, err := fareio.NewPrivateFareRegistry()
	if err != nil {
		t.Fatal(err)
	}
	cases := []struct {
		name            string
		stations, lines []string
		want            int
		errorText       string
	}{
		// 路線識別子が変わっても会社が同じなら、260+610ではなく850円。
		{"同一会社の路線変更", []string{"長野", "豊野", "妙高高原"}, []string{"しなの鉄道", "北しなの"}, 850, ""},
		{"未知の路線", []string{"青森", "目時"}, []string{"不明な路線"}, 0, "私鉄の会社が未登録です"},
		{"未知の区間", []string{"青森", "未登録駅"}, []string{"青い森鉄道"}, 0, "青い森鉄道: 青森 - 未登録駅"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			g := graph.NewGraph(len(tc.stations))
			var edges []*ticketdomain.TicketEdge
			for i, line := range tc.lines {
				edges = append(edges, &ticketdomain.TicketEdge{Line: line, Edge: domain.Edge{FromID: g.GetOrAddID(tc.stations[i]), ToID: g.GetOrAddID(tc.stations[i+1]), Company: domain.Other}})
			}
			calc := &CalculateAmount{graph: g, privateFareReg: reg}
			got, err := calc.calculatePrivateFare(edges)
			if tc.errorText != "" {
				if err == nil || !strings.Contains(err.Error(), tc.errorText) {
					t.Fatalf("エラー=%v、期待値=%s", err, tc.errorText)
				}
				return
			}
			if err != nil {
				t.Fatal(err)
			}
			if got != tc.want {
				t.Fatalf("運賃=%d、期待値=%d", got, tc.want)
			}
		})
	}
}
