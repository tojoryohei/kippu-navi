package fareio

import (
	ticketdomain "calculation-engine/internal/ticket/domain"
	_ "embed"
	"fmt"
)

//go:embed data/specificFares.json
var specificFaresJSON []byte

//go:embed data/adjustedFares.json
var adjustedFaresJSON []byte

// Registry holds the embedded JSON data for ticket specific/adjusted fares.
type Registry struct {
	specificFares []ticketdomain.PathAndFare
	adjustedFares []ticketdomain.PathAndFare
}

// NewRegistry initializes and returns a new Registry with loaded JSON data.
func NewRegistry() (*Registry, error) {
	sf, err := loadPathAndFare(specificFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("特定区間運賃の読み込みに失敗しました: %w", err)
	}

	af, err := loadPathAndFare(adjustedFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("調整区間運賃の読み込みに失敗しました: %w", err)
	}

	return &Registry{
		specificFares: sf,
		adjustedFares: af,
	}, nil
}

// GetSpecificFares returns the list of specific fares.
func (r *Registry) GetSpecificFares() []ticketdomain.PathAndFare {
	return r.specificFares
}

// GetAdjustedFares returns the list of adjusted fares.
func (r *Registry) GetAdjustedFares() []ticketdomain.PathAndFare {
	return r.adjustedFares
}
