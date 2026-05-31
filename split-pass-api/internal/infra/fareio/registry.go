package fareio

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"

	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph"
)

//go:embed data/eastTrunkFares.json
var eastTrunkFaresJSON []byte

//go:embed data/eastLocalFares.json
var eastLocalFaresJSON []byte

//go:embed data/hokkaidoTrunkFares.json
var hokkaidoTrunkFaresJSON []byte

//go:embed data/hokkaidoLocalFares.json
var hokkaidoLocalFaresJSON []byte

//go:embed data/kyushuFares.json
var kyushuFaresJSON []byte

//go:embed data/shikokuFares.json
var shikokuFaresJSON []byte

//go:embed data/standardTrunkFares.json
var standardTrunkFaresJSON []byte

//go:embed data/standardLocalFares.json
var standardLocalFaresJSON []byte

//go:embed data/trainSpecificSectionFares.json
var trainSpecificSectionFaresJSON []byte

//go:embed data/specificFares.json
var specificFaresJSON []byte

//go:embed data/adjustedFares.json
var adjustedFaresJSON []byte

func loadFareTable(data []byte) ([101]domain.PassFare, error) {
	var table [101]domain.PassFare
	var slice []domain.PassFare

	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()

	if err := decoder.Decode(&slice); err != nil {
		return table, err
	}

	if _, err := decoder.Token(); err != io.EOF {
		return table, fmt.Errorf("JSONデータの末尾に予期せぬデータが含まれています")
	}

	if len(slice) != 101 {
		return table, fmt.Errorf("運賃テーブルの要素数が不正です（期待値: 101, 実際: %d）", len(slice))
	}

	copy(table[:], slice)
	return table, nil
}

func loadRouteFares(data []byte, name string) ([]domain.RouteAndFare, error) {
	var rawData []rawRouteAndFare
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&rawData); err != nil {
		return nil, fmt.Errorf("%sのデコードに失敗しました: %w", name, err)
	}

	if _, err := decoder.Token(); err != io.EOF {
		return nil, fmt.Errorf("%sデータの末尾に予期せぬデータが含まれています", name)
	}

	dataResult := make([]domain.RouteAndFare, 0, len(rawData))
	for _, raw := range rawData {
		if len(raw.Route) < 2 {
			return nil, fmt.Errorf("%s: 経路には少なくとも2つの駅が必要です（不正なデータ: %v）", name, raw.Route)
		}
		dataResult = append(dataResult, domain.RouteAndFare{
			Route: raw.Route,
			Fare: domain.PassFare{
				OneMonth:   raw.Fare.OneMonth,
				ThreeMonth: raw.Fare.ThreeMonth,
				SixMonth:   raw.Fare.SixMonth,
			},
		})
	}
	return dataResult, nil
}

// Calculators は初期化済みの各種計算機を保持します。
type Calculators struct {
	Registry      *fare.Registry
	TrainSpecific *fare.TrainSpecificSectionCalculator
	SpecificRoute *fare.RouteMatcher
	AdjustedRoute *fare.RouteMatcher
}

// InitRegistry はJSONデータをデコードし、全ての運賃計算機を初期化して返します。
func InitRegistry(g *graph.Graph) (*Calculators, error) {
	eastTrunk, err := loadFareTable(eastTrunkFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("eastTrunkFaresの読み込みに失敗: %w", err)
	}
	eastLocal, err := loadFareTable(eastLocalFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("eastLocalFaresの読み込みに失敗: %w", err)
	}

	hokkaidoTrunk, err := loadFareTable(hokkaidoTrunkFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("hokkaidoTrunkFaresの読み込みに失敗: %w", err)
	}
	hokkaidoLocal, err := loadFareTable(hokkaidoLocalFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("hokkaidoLocalFaresの読み込みに失敗: %w", err)
	}

	kyushu, err := loadFareTable(kyushuFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("kyushuFaresの読み込みに失敗: %w", err)
	}

	shikoku, err := loadFareTable(shikokuFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("shikokuFaresの読み込みに失敗: %w", err)
	}

	standardTrunk, err := loadFareTable(standardTrunkFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("standardTrunkFaresの読み込みに失敗: %w", err)
	}
	standardLocal, err := loadFareTable(standardLocalFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("standardLocalFaresの読み込みに失敗: %w", err)
	}

	trainSpecific, err := loadFareTable(trainSpecificSectionFaresJSON)
	if err != nil {
		return nil, fmt.Errorf("trainSpecificSectionFaresの読み込みに失敗: %w", err)
	}

	reg := fare.NewRegistry()
	reg.Register(domain.JREast, fare.NewEastCalculator(eastTrunk, eastLocal))
	reg.Register(domain.JRHokkaido, fare.NewHokkaidoCalculator(hokkaidoTrunk, hokkaidoLocal))
	reg.Register(domain.JRKyushu, fare.NewKyushuCalculator(kyushu))
	reg.Register(domain.JRShikoku, fare.NewShikokuCalculator(shikoku))
	reg.Register(domain.JRCentral, fare.NewStandardCalculator(standardTrunk, standardLocal))
	reg.Register(domain.JRWest, fare.NewStandardCalculator(standardTrunk, standardLocal))

	trainSpecificCalc := fare.NewTrainSpecificSectionCalculator(trainSpecific)

	// 特定区間の運賃
	specificFares, err := loadRouteFares(specificFaresJSON, "特定運賃区間")
	if err != nil {
		return nil, fmt.Errorf("特定運賃区間の読み込みに失敗: %w", err)
	}
	specificSectionMatcher := fare.NewRouteMatcher()
	if err := specificSectionMatcher.LoadFromDomain(specificFares, g); err != nil {
		return nil, fmt.Errorf("特定運賃区間マッチャーの構築に失敗: %w", err)
	}

	// 調整運賃区間
	adjustedFares, err := loadRouteFares(adjustedFaresJSON, "調整運賃区間")
	if err != nil {
		return nil, fmt.Errorf("調整運賃区間の読み込みに失敗: %w", err)
	}
	adjustedFareMatcher := fare.NewRouteMatcher()
	if err := adjustedFareMatcher.LoadFromDomain(adjustedFares, g); err != nil {
		return nil, fmt.Errorf("調整運賃区間マッチャーの構築に失敗: %w", err)
	}

	return &Calculators{
		Registry:      reg,
		TrainSpecific: trainSpecificCalc,
		SpecificRoute: specificSectionMatcher,
		AdjustedRoute: adjustedFareMatcher,
	}, nil
}
