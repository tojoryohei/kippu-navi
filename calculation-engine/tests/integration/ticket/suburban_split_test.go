package ticket_test

import (
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"slices"
	"testing"
)

func TestSuburbanSplitAndCheapestUseNormalPath(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	fareEval := func(path []int) (int, error) {
		r, _, err := evaluator.ExecuteWithMode(path, 0, "normal")
		if err != nil {
			return 0, err
		}
		return r.TotalAmount(), nil
	}
	corrector := usecase.NewSuburbanAreaCorrector(fareEval)
	evaluator.SetSplitCorrector(corrector)
	var path []int
	for _, name := range []string{"東京", "神田", "秋葉原", "御徒町", "上野", "鶯谷", "日暮里", "西日暮里", "田端", "駒込", "巣鴨", "大塚", "池袋", "目白", "高田馬場", "新大久保", "新宿"} {
		id, ok := g.GetID(name)
		if !ok {
			t.Fatal(name)
		}
		path = append(path, id)
	}
	normal, err := corrector.Correct(path, g)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Equal(path, normal) {
		t.Fatal("迂回経路が補正されません")
	}
	want, wantPath, err := evaluator.ExecuteWithMode(normal, 0, "normal")
	if err != nil {
		t.Fatal(err)
	}
	cheapest, _, err := usecase.SelectCheapestPathWithRouteExtensionsAndPreShinkansenPath(path, g, corrector, nil, zones, fareEval)
	if err != nil {
		t.Fatal(err)
	}
	if !slices.Equal(cheapest, normal) {
		t.Fatalf("最安=%v 通常=%v", cheapest, normal)
	}
	got, gotPath, err := evaluator.ExecuteForSplit(path, 0)
	if err != nil {
		t.Fatal(err)
	}
	if got.TotalAmount() != want.TotalAmount() || !slices.Equal(gotPath, wantPath) {
		t.Fatalf("分割評価が通常と異なります: %d %v / %d %v", got.TotalAmount(), gotPath, want.TotalAmount(), wantPath)
	}
	input := make([]usecase.ViaStep, len(path))
	for i, id := range path {
		input[i] = usecase.ViaStep{StationName: g.GetName(id), LineName: "ヤマテ"}
	}
	for _, mode := range []string{"normal", "cheapest"} {
		via := usecase.GetCalculatedFareVia(mode, input, path, gotPath, got.FinalPath, g, zones)
		if !slices.Equal(via, []string{"東北", "中央東"}) {
			t.Fatalf("%s via=%v, want 東北・中央東", mode, via)
		}
	}
	if via := usecase.GetAutomaticFareViaForResult(g, gotPath, got.FinalPath); !slices.Equal(via, []string{"東北", "中央東"}) {
		t.Fatalf("split via=%v", via)
	}

	shortest, err := g.FindShortestPathGisei(path[0], path[len(path)-1])
	if err != nil {
		t.Fatal(err)
	}
	cached, cachedPath, err := evaluator.ExecuteForSplit(shortest.StationIDs, 0)
	if err != nil {
		t.Fatal(err)
	}
	if cached.TotalAmount() != got.TotalAmount() || !slices.Equal(cachedPath, gotPath) {
		t.Fatalf("事前計算候補と不一致: %d %v / %d %v", cached.TotalAmount(), cachedPath, got.TotalAmount(), gotPath)
	}
}
