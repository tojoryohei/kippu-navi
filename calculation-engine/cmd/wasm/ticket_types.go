//go:build js && wasm

package main

import ticketusecase "calculation-engine/internal/ticket/usecase"

// 乗車券のWASM呼び出しで使用する入出力型。
type PathStep struct {
	StationName string  `json:"stationName"`
	LineName    *string `json:"lineName"`
}

type RouteRequest struct {
	FullPath        []PathStep `json:"fullPath"`
	CalculationMode string     `json:"calculationMode"`
}

// ViaSteps は入力経路のカナコードを経由印字用に渡します。
func (r RouteRequest) ViaSteps() []ticketusecase.ViaStep {
	steps := make([]ticketusecase.ViaStep, len(r.FullPath))
	for i, step := range r.FullPath {
		steps[i].StationName = step.StationName
		if step.LineName != nil {
			steps[i].LineName = *step.LineName
		}
	}
	return steps
}

type KippuData struct {
	TotalEigyoKilo   int      `json:"totalEigyoKilo"`
	DepartureStation string   `json:"departureStation"`
	ArrivalStation   string   `json:"arrivalStation"`
	PrintedViaLines  []string `json:"printedViaLines"`
	Fare             int      `json:"fare"`
	ValidDays        int      `json:"validDays"`
}

type RouteResponse struct {
	Data KippuData `json:"data"`
	Time float64   `json:"time"`
}
