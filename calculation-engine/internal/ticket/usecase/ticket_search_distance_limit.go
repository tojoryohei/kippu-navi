package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
	"fmt"
	"strings"
)

// TicketSearchDistanceLimit describes every integer component used to derive
// the physical-route search ceiling.
type TicketSearchDistanceLimit struct {
	ShortestGisei          domain.DeciKilo
	OriginCenterGisei      domain.DeciKilo
	DestinationCenterGisei domain.DeciKilo
	Margin                 domain.DeciKilo
	MaxGisei               domain.DeciKilo
}

func ticketSearchMargin(base domain.DeciKilo) domain.DeciKilo {
	switch {
	case base <= 1000:
		return 100
	case base <= 6000:
		return 200
	default:
		return 400
	}
}

func isTicketCityZone(name string) bool {
	return name == "東京都区内" || (name != "東京山手線内" && strings.HasSuffix(name, "市内"))
}

func precomputedCenterDistance(reg *graphio.SpecialZoneRegistry, station string) (domain.DeciKilo, error) {
	if reg == nil {
		return 0, nil
	}
	var maxDistance domain.DeciKilo
	found := false
	for _, zone := range reg.FindZonesByStation(station) {
		if !isTicketCityZone(zone.Name) {
			continue
		}
		distance, ok := zone.CenterGiseiDeciKilo[station]
		if !ok || distance < 0 {
			return 0, fmt.Errorf("特定市内の中心駅距離がありません: zone=%s station=%s", zone.Name, station)
		}
		if !found || distance > maxDistance {
			maxDistance = distance
		}
		found = true
	}
	return maxDistance, nil
}

func calculateTicketSearchDistanceLimit(g graph.Graph, reg *graphio.SpecialZoneRegistry, startID, endID int) (TicketSearchDistanceLimit, error) {
	shortest, err := g.FindShortestPathGisei(startID, endID)
	if err != nil {
		return TicketSearchDistanceLimit{}, err
	}
	originCenter, err := precomputedCenterDistance(reg, g.GetName(startID))
	if err != nil {
		return TicketSearchDistanceLimit{}, err
	}
	destinationCenter, err := precomputedCenterDistance(reg, g.GetName(endID))
	if err != nil {
		return TicketSearchDistanceLimit{}, err
	}
	base := shortest.GiseiKilo + originCenter + destinationCenter
	margin := ticketSearchMargin(base)
	return TicketSearchDistanceLimit{
		ShortestGisei: shortest.GiseiKilo, OriginCenterGisei: originCenter,
		DestinationCenterGisei: destinationCenter, Margin: margin, MaxGisei: base + margin,
	}, nil
}
