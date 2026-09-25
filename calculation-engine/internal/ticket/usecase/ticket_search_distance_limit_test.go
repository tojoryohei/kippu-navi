package usecase

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"testing"
)

func TestTicketSearchMarginBoundaries(t *testing.T) {
	tests := []struct {
		base, want domain.DeciKilo
	}{{1000, 100}, {1001, 200}, {6000, 200}, {6001, 400}}
	for _, tt := range tests {
		if got := ticketSearchMargin(tt.base); got != tt.want {
			t.Errorf("ticketSearchMargin(%d) = %d, want %d", tt.base, got, tt.want)
		}
	}
}

func TestCalculateTicketSearchDistanceLimitAddsBothCityEndpoints(t *testing.T) {
	g := graph.NewGraph(3)
	a := g.GetOrAddID("A")
	b := g.GetOrAddID("B")
	center := g.GetOrAddID("中心")
	add := func(from, to int, distance domain.DeciKilo) {
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: from, ToID: to, GiseiKilo: distance, EigyoKilo: distance, Company: domain.JREast}})
	}
	add(a, b, 500)
	add(b, a, 500)
	add(a, center, 100)
	add(center, a, 100)
	add(b, center, 200)
	add(center, b, 200)
	if err := g.Validate(); err != nil {
		t.Fatal(err)
	}
	city := ticketdomain.SpecialZone{Name: "試験市内", Stations: []string{"A", "B"}, CenterGiseiDeciKilo: map[string]domain.DeciKilo{"A": 100, "B": 200}}
	yamanote := ticketdomain.SpecialZone{Name: "東京山手線内", Stations: []string{"A"}, CenterGiseiDeciKilo: map[string]domain.DeciKilo{"A": 999}}
	reg := &graphio.SpecialZoneRegistry{Zones: []ticketdomain.SpecialZone{city, yamanote}, StationToZones: map[string][]ticketdomain.SpecialZone{"A": {city, yamanote}, "B": {city}}}

	got, err := calculateTicketSearchDistanceLimit(g, reg, a, b)
	if err != nil {
		t.Fatal(err)
	}
	if got.ShortestGisei != 300 || got.OriginCenterGisei != 100 || got.DestinationCenterGisei != 200 || got.Margin != 100 || got.MaxGisei != 700 {
		t.Fatalf("distance limit = %+v", got)
	}
}

func TestPrecomputedCenterDistanceRequiresCityData(t *testing.T) {
	zone := ticketdomain.SpecialZone{Name: "試験市内", Stations: []string{"A"}}
	reg := &graphio.SpecialZoneRegistry{StationToZones: map[string][]ticketdomain.SpecialZone{"A": {zone}}}
	if _, err := precomputedCenterDistance(reg, "A"); err == nil {
		t.Fatal("中心駅距離欠落を受理しました")
	}
}
