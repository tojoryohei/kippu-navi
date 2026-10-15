package graph_test

import (
	"calculation-engine/internal/graphdata"
	"calculation-engine/internal/ticket/infra/graphio"
	"testing"
)

func TestRailwayGraph_LoadAndFindPath(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(graphdata.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフの読み込みに失敗しました: %v", err)
	}
	if err := g.Validate(); err != nil {
		t.Fatalf("グラフの検証に失敗しました: %v", err)
	}

	t.Logf("%d駅を読み込みました", g.NumStations())

	// 東京から大阪までの経路探索をテスト
	tokyoID, tokyoExists := g.GetID("東京")
	osakaID, osakaExists := g.GetID("大阪")

	if !tokyoExists || !osakaExists {
		t.Skip("東京または大阪がedges.jsonに存在しないため、経路探索のテストをスキップします")
	}

	res, err := g.FindShortestPathGisei(tokyoID, osakaID)
	if err != nil {
		t.Fatalf("経路の検索に失敗しました: %v", err)
	}

	if len(res.StationIDs) == 0 {
		t.Errorf("経路が空です")
	}

	t.Logf("東京から大阪への経路が見つかりました: %d駅、擬制キロ: %d、営業キロ: %d",
		len(res.StationIDs), res.GiseiKilo, res.EigyoKilo)
}
