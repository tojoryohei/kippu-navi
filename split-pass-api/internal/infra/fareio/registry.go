package fareio

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"

	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
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

// InitRegistry はJSONデータをデコードし、全ての運賃計算機を初期化した fare.Registry を返します。
// 合わせて、TrainSpecificSectionCalculator も初期化して返します。
func InitRegistry() (*fare.Registry, *fare.TrainSpecificSectionCalculator, error) {
	eastTrunk, err := loadFareTable(eastTrunkFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("eastTrunkFaresの読み込みに失敗: %w", err)
	}
	eastLocal, err := loadFareTable(eastLocalFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("eastLocalFaresの読み込みに失敗: %w", err)
	}

	hokkaidoTrunk, err := loadFareTable(hokkaidoTrunkFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("hokkaidoTrunkFaresの読み込みに失敗: %w", err)
	}
	hokkaidoLocal, err := loadFareTable(hokkaidoLocalFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("hokkaidoLocalFaresの読み込みに失敗: %w", err)
	}

	kyushu, err := loadFareTable(kyushuFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("kyushuFaresの読み込みに失敗: %w", err)
	}

	shikoku, err := loadFareTable(shikokuFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("shikokuFaresの読み込みに失敗: %w", err)
	}

	standardTrunk, err := loadFareTable(standardTrunkFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("standardTrunkFaresの読み込みに失敗: %w", err)
	}
	standardLocal, err := loadFareTable(standardLocalFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("standardLocalFaresの読み込みに失敗: %w", err)
	}

	trainSpecific, err := loadFareTable(trainSpecificSectionFaresJSON)
	if err != nil {
		return nil, nil, fmt.Errorf("trainSpecificSectionFaresの読み込みに失敗: %w", err)
	}

	reg := fare.NewRegistry()
	reg.Register(domain.JREast, fare.NewEastCalculator(eastTrunk, eastLocal))
	reg.Register(domain.JRHokkaido, fare.NewHokkaidoCalculator(hokkaidoTrunk, hokkaidoLocal))
	reg.Register(domain.JRKyushu, fare.NewKyushuCalculator(kyushu))
	reg.Register(domain.JRShikoku, fare.NewShikokuCalculator(shikoku))
	reg.Register(domain.JRCentral, fare.NewStandardCalculator(standardTrunk, standardLocal))
	reg.Register(domain.JRWest, fare.NewStandardCalculator(standardTrunk, standardLocal))

	trainSpecificCalc := fare.NewTrainSpecificSectionCalculator(trainSpecific)

	return reg, trainSpecificCalc, nil
}
