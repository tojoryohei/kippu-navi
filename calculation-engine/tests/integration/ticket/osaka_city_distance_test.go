package ticket_test

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"slices"
	"testing"
)

func TestOsakaCityDistanceWithoutVirtualEdge(t *testing.T) {
	calc, g := setupTicketAmount(t)
	id := func(name string) int {
		v, ok := g.GetID(name)
		if !ok {
			t.Fatalf("駅がない: %s", name)
		}
		return v
	}
	for _, pair := range [][2]string{{"大阪", "新神戸"}, {"新神戸", "大阪"}} {
		for _, e := range g.GetEdges(id(pair[0])) {
			if e.ToID == id(pair[1]) {
				t.Fatal("大阪・新神戸仮想エッジが残っている")
			}
		}
	}
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	for _, tt := range []struct {
		name      string
		names     []string
		deduction domain.DeciKilo
	}{
		{"山陽方面", []string{"大阪", "新大阪", "新神戸", "西明石", "姫路", "相生", "岡山", "新倉敷", "福山"}, 76},
		{"京都方面", []string{"大阪", "新大阪", "京都", "米原", "岐阜羽島", "名古屋", "三河安城", "豊橋", "浜松"}, 0},
	} {
		for _, reverse := range []bool{false, true} {
			names := slices.Clone(tt.names)
			if reverse {
				slices.Reverse(names)
			}
			path := make([]int, len(names))
			for i, name := range names {
				path[i] = id(name)
			}
			for _, mode := range []string{"normal", "cheapest", "uncorrect"} {
				t.Run(tt.name+"/"+names[0]+"/"+mode, func(t *testing.T) {
					result, final, err := evaluator.ExecuteWithMode(path, 0, mode)
					if err != nil {
						t.Fatal(err)
					}
					boundary := 0
					if reverse {
						boundary = len(final) - 1
					}
					if g.GetName(final[boundary]) != "大阪市内" {
						t.Fatalf("市内が適用されない: %v", final)
					}
					next := boundary + 1
					if reverse {
						next = boundary - 1
					}
					if g.GetName(final[next]) != "新大阪" {
						t.Fatal("新大阪が経路から失われた")
					}
					raw, err := calc.Execute(final)
					if err != nil {
						t.Fatal(err)
					}
					deduction := tt.deduction
					if mode == "uncorrect" {
						deduction = 0
					}
					if result.TotalEigyoKilo != raw.TotalEigyoKilo-deduction || result.TotalPathEigyoKilo != raw.TotalPathEigyoKilo-deduction {
						t.Fatalf("距離: result=%+v raw=%+v deduction=%d", result, raw, deduction)
					}
				})
			}
		}
	}
}
