package fare

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed data/shikokuFares.json
var shikokuFaresJSON []byte

func NewShikokuCalculator() (*ShikokuCalculator, error) {
	var shikokuFares [101]PassFare
	if err := json.Unmarshal(shikokuFaresJSON, &shikokuFares); err != nil {
		return nil, fmt.Errorf("shikokuFaresの読み込みに失敗しました: %w", err)
	}
	return &ShikokuCalculator{fares: shikokuFares}, nil
}

type ShikokuCalculator struct {
	fares [101]PassFare
}

func (c *ShikokuCalculator) Calculate(params PassFareParams) (int, error) {
	return calculateSingleTableFare(params, &c.fares)
}
