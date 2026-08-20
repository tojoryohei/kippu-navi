package domain

import "calculation-engine/internal/domain"

// SpecialZone は特定都区市内などの特例ルールを表現するドメインモデルです。
type SpecialZone struct {
	Name                string
	CenterStation       string
	MinDistanceDeciKilo domain.DeciKilo
	MaxDistanceDeciKilo domain.DeciKilo
	Stations            []string
}
