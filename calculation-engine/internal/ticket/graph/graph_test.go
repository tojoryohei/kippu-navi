package graph_test

import (
	"os"
	"testing"
	"calculation-engine/internal/ticket/infra/graphio"
)

func TestRailwayGraph_LoadAndFindPath(t *testing.T) {
	file, err := os.Open("data/edges.json")
	if err != nil {
		t.Fatalf("Failed to open edges.json: %v", err)
	}
	defer file.Close()

	loader := &graphio.JSONLoader{}
	g, err := loader.Load(file)
	if err != nil {
		t.Fatalf("Failed to load graph: %v", err)
	}
	if err := g.Validate(); err != nil {
		t.Fatalf("Failed to validate graph: %v", err)
	}

	t.Logf("Loaded %d stations", g.NumStations())

	// 東京から大阪までの経路探索をテスト
	tokyoID, tokyoExists := g.GetID("東京")
	osakaID, osakaExists := g.GetID("大阪")

	if !tokyoExists || !osakaExists {
		t.Skip("東京または大阪がedges.jsonに存在しないため、経路探索のテストをスキップします")
	}

	res, err := g.FindShortestPathGisei(tokyoID, osakaID)
	if err != nil {
		t.Fatalf("Failed to find path: %v", err)
	}

	if len(res.StationIDs) == 0 {
		t.Errorf("Path is empty")
	}
	
	t.Logf("Path from Tokyo to Osaka found: %d stations, GiseiKilo: %d, EigyoKilo: %d", 
		len(res.StationIDs), res.GiseiKilo, res.EigyoKilo)
}
