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
			t.Fatalf("%s 経由=%v, 期待値 東北・中央東", mode, via)
		}
	}
	if via := usecase.GetAutomaticFareViaForResult(g, gotPath, got.FinalPath); !slices.Equal(via, []string{"東北", "中央東"}) {
		t.Fatalf("分割の経由=%v", via)
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

func TestSplitSegmentOutsideSuburbanUsesNormalCorrection(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	corrector := usecase.NewPipelineCorrector(
		usecase.NewSuburbanAreaCorrector(func(path []int) (int, error) {
			res, _, err := evaluator.ExecuteWithMode(path, 0, "normal")
			if err != nil {
				return 0, err
			}
			return res.TotalAmount(), nil
		}),
		usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(),
		usecase.NewRule69Corrector(), usecase.NewRule157Corrector(),
	)
	evaluator.SetSplitCorrector(corrector)
	var path []int
	// 分割後の1枚が近郊区間外まで延び、赤羽〜大宮を埼京線で通る候補。
	for _, pair := range [][2]string{{"浜松", "東京"}, {"東京", "赤羽"}} {
		from, _ := g.GetID(pair[0])
		to, _ := g.GetID(pair[1])
		part, err := g.FindShortestPathGisei(from, to)
		if err != nil {
			t.Fatal(err)
		}
		path = append(path, part.StationIDs[:len(part.StationIDs)-1]...)
	}
	for _, name := range []string{"赤羽", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "大宮", "土呂"} {
		id, ok := g.GetID(name)
		if !ok {
			t.Fatal(name)
		}
		path = append(path, id)
	}
	original := slices.Clone(path)
	if usecase.IsSuburbanAreaComplete(path, g) {
		t.Fatal("近郊区間外の候補が必要です")
	}
	corrected, err := corrector.Correct(slices.Clone(path), g)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Equal(corrected, path) {
		t.Fatal("通常補正で埼京線経由が変わりません")
	}
	want, wantPath, err := evaluator.ExecuteWithMode(corrected, 0, "normal")
	if err != nil {
		t.Fatal(err)
	}
	got, gotPath, err := evaluator.ExecuteForSplit(path, 0)
	if err != nil {
		t.Fatal(err)
	}
	if got.TotalAmount() != want.TotalAmount() || !slices.Equal(gotPath, wantPath) {
		t.Fatalf("分割後の評価が通常補正と不一致: %d %v / %d %v", got.TotalAmount(), gotPath, want.TotalAmount(), wantPath)
	}
	if !slices.Equal(path, original) {
		t.Fatal("候補経路が書き換えられました")
	}
}
