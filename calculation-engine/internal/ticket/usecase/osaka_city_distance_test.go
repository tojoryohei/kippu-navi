package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/fareio"
	"calculation-engine/internal/ticket/infra/graphio"
	"fmt"
	"slices"
	"testing"
)

func TestOsakaCityDistanceDeductionDirection(t *testing.T) {
	g := graph.NewGraph(8)
	id := g.GetOrAddID
	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: id("大阪"), ToID: id("新大阪"), Company: domain.JRWest, EigyoKilo: 38, GiseiKilo: 42}})
	calc := &CalculateAmount{graph: g}
	for _, tt := range []struct {
		name  string
		names []string
		count domain.DeciKilo
	}{
		{"山陽方面", []string{"大阪市内", "新大阪", "新神戸"}, 1},
		{"京都方面", []string{"大阪市内", "新大阪", "京都"}, 0},
		{"在来線東側", []string{"大阪市内", "新大阪", "東淀川"}, 0},
		{"第88条", []string{"大阪・新大阪", "新大阪", "新神戸"}, 0},
		{"駅発着", []string{"大阪", "新大阪", "新神戸"}, 0},
		{"途中の市内駅", []string{"別駅", "大阪市内", "新大阪", "新神戸", "終点"}, 0},
		{"両端", []string{"大阪市内", "新大阪", "新神戸", "新大阪", "大阪市内"}, 2},
	} {
		t.Run(tt.name, func(t *testing.T) {
			path := make([]int, len(tt.names))
			for i, name := range tt.names {
				path[i] = id(name)
			}
			for range 2 {
				e, gs, err := calc.osakaCityDistanceDeduction(path)
				if err != nil || e != 76*tt.count || gs != 84*tt.count {
					t.Fatalf("got %d/%d %v", e, gs, err)
				}
				slices.Reverse(path)
			}
		})
	}
	if got := g.GetEdges(id("大阪"))[0]; got.EigyoKilo != 38 || got.GiseiKilo != 42 {
		t.Fatal("グラフの距離が変更された")
	}
}

func TestOsakaCityDistanceSummary(t *testing.T) {
	s := &routeSummary{totalEigyo: 2100, totalGisei: 2200, totalPathEigyo: 2300, statsByCompany: make([]companyStats, domain.CompanyCount)}
	s.statsByCompany[domain.JRWest] = companyStats{used: true, eigyo: 1000, gisei: 1100}
	s.statsByCompany[domain.JRCentral] = companyStats{used: true, eigyo: 1100, gisei: 1100}
	if err := s.deductOsakaCityDistance(76, 84); err != nil {
		t.Fatal(err)
	}
	if s.totalEigyo != 2024 || s.totalGisei != 2116 || s.totalPathEigyo != 2224 || s.statsByCompany[domain.JRWest].eigyo != 924 || s.statsByCompany[domain.JRWest].gisei != 1016 || s.statsByCompany[domain.JRCentral].eigyo != 1100 {
		t.Fatalf("集計が不正: %+v", s)
	}
	if err := s.deductOsakaCityDistance(3000, 3000); err == nil {
		t.Fatal("過剰な控除を許可した")
	}
}

func newOsakaDistanceTestCalculator(g *graph.RailwayGraph) *CalculateAmount {
	privateReg, _ := fareio.NewPrivateFareRegistry()
	return NewCalculateAmount(fare.NewRegistry(), fare.NewAddonRegistry(), fare.NewTrainSpecificSectionCalculator(), fare.NewPathMatcher(), fare.NewPathMatcher(), privateReg, g, ticketdomain.ZoneRoutes{"大阪市内": {"新大阪": {"大阪", "新大阪"}}})
}

func TestOsakaCityThresholdAfterDeduction(t *testing.T) {
	for _, distance := range []domain.DeciKilo{1999, 2000, 2001} {
		t.Run(fmt.Sprint(distance), func(t *testing.T) {
			g := graph.NewGraph(8)
			id := g.GetOrAddID
			edge := func(a, b string, d domain.DeciKilo) {
				g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: id(a), ToID: id(b), Company: domain.JRWest, EigyoKilo: d, GiseiKilo: d}})
			}
			edge("大阪", "新大阪", 38)
			edge("新大阪", "新神戸", 369)
			edge("新神戸", "終点", distance-331)
			id("大阪市内")
			id("大阪・新大阪")
			zone := ticketdomain.SpecialZone{Name: "大阪市内", MinDistanceDeciKilo: 2000, Stations: []string{"大阪", "新大阪"}}
			zones := &graphio.SpecialZoneRegistry{StationToZones: map[string][]ticketdomain.SpecialZone{"大阪": {zone}, "新大阪": {zone}}}
			calc := newOsakaDistanceTestCalculator(g)
			evaluator := NewTicketSegmentEvaluator(calc, NewSpecialZoneApplier(g, zones), nil, zones, g)
			result, final, err := evaluator.ExecuteWithMode([]int{id("大阪"), id("新大阪"), id("新神戸"), id("終点")}, 0, "normal")
			if err != nil {
				t.Fatal(err)
			}
			isCity := g.GetName(final[0]) == "大阪市内"
			if isCity != (distance > 2000) {
				t.Fatalf("距離%dで市内判定が不正: %v", distance, final)
			}
			if isCity && result.TotalEigyoKilo != distance {
				t.Fatalf("距離が不正: %+v", result)
			}
		})
	}
}

func TestOsakaCityDeductionWithKitashinchiReplacement(t *testing.T) {
	g := graph.NewGraph(12)
	id := g.GetOrAddID
	edge := func(a, b string, d domain.DeciKilo) {
		x, y := id(a), id(b)
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: x, ToID: y, Company: domain.JRWest, EigyoKilo: d, GiseiKilo: d}})
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: y, ToID: x, Company: domain.JRWest, EigyoKilo: d, GiseiKilo: d}})
	}
	edge("大阪", "新大阪", 38)
	edge("新大阪", "新神戸", 369)
	edge("新神戸", "尼崎", 2000)
	names := []string{"北新地", "新福島", "海老江", "御幣島", "加島", "尼崎"}
	for i, d := range []domain.DeciKilo{12, 12, 26, 17, 22} {
		edge(names[i], names[i+1], d)
	}
	edge("大阪", "塚本", 34)
	edge("塚本", "尼崎", 43)
	path := []int{id("大阪市内"), id("新大阪"), id("新神戸"), id("尼崎"), id("加島"), id("御幣島"), id("海老江"), id("新福島"), id("北新地")}
	calc := newOsakaDistanceTestCalculator(g)
	for range 2 {
		result, err := calc.execute(path, true)
		if err != nil {
			t.Fatal(err)
		}
		// 物理経路は38+369+2000+89、北新地置換後は末尾77。両者から一度だけ76を控除する。
		if result.TotalEigyoKilo != 2420 || result.TotalPathEigyoKilo != 2420 {
			t.Fatalf("物理距離が不正: %+v", result)
		}
		// 運賃集計にも控除が反映されたことを、同じ合計距離の単一区間と比較する。
		edge("比較始点", "比較終点", 2408)
		expected, err := calc.Execute([]int{id("比較始点"), id("比較終点")})
		if err != nil {
			t.Fatal(err)
		}
		if result.TotalAmount() != expected.TotalAmount() {
			t.Fatalf("運賃: %d, want %d", result.TotalAmount(), expected.TotalAmount())
		}
		slices.Reverse(path)
	}
}
