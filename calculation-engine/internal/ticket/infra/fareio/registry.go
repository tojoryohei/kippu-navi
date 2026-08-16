package fareio

import (
	_ "embed"
	"fmt"
	ticketdomain "calculation-engine/internal/ticket/domain"
)

//go:embed data/specificFares.json
var specificFaresJSON []byte

//go:embed data/adjustedFares.json
var adjustedFaresJSON []byte

// Registry holds the embedded JSON data for ticket specific/adjusted fares.
type Registry struct {
	specificFares []ticketdomain.RouteAndFare
	adjustedFares []ticketdomain.RouteAndFare
}

// NewRegistry initializes and returns a new Registry with loaded JSON data.
func NewRegistry() (*Registry, error) {
	sf, err := loadRouteAndFare(specificFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("特定区間運賃の読み込みに失敗しました: %w", err)
	}

	af, err := loadRouteAndFare(adjustedFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("調整区間運賃の読み込みに失敗しました: %w", err)
	}

	return &Registry{
		specificFares: sf,
		adjustedFares: af,
	}, nil
}

// GetSpecificFares returns the list of specific fares.
func (r *Registry) GetSpecificFares() []ticketdomain.RouteAndFare {
	return r.specificFares
}

// GetAdjustedFares returns the list of adjusted fares.
func (r *Registry) GetAdjustedFares() []ticketdomain.RouteAndFare {
	return r.adjustedFares
}
