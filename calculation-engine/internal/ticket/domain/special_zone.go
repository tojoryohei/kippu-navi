package domain

import "calculation-engine/internal/domain"

// SpecialZone は特定都区市内などの特例ルールを表現するドメインモデルです。
type SpecialZone struct {
	Name                string
	MinDistanceDeciKilo domain.DeciKilo
	MaxDistanceDeciKilo domain.DeciKilo
	Stations            []string
	// CenterGiseiDeciKilo stores the precomputed shortest physical distance
	// from each member station to this zone's official center station.
	CenterGiseiDeciKilo map[string]domain.DeciKilo
}
