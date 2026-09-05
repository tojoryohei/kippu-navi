package graphio

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/graphdata"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"encoding/json"
	"fmt"
	"io"
)

type rawSpecialZone struct {
	Name                string   `json:"name"`
	MinDistanceDeciKilo int      `json:"minDistanceDeciKilo"`
	MaxDistanceDeciKilo int      `json:"maxDistanceDeciKilo"`
	Stations            []string `json:"stations"`
}

// ZoneCenterStations maps each special zone name to its official JR center station name.
var ZoneCenterStations = map[string]string{
	"札幌市内":      "札幌",
	"仙台市内":      "仙台",
	"東京都区内":     "東京",
	"横浜市内":      "横浜",
	"名古屋市内":     "名古屋",
	"京都市内":      "京都",
	"大阪市内":      "大阪",
	"神戸市内":      "神戸",
	"広島市内":      "広島",
	"北九州市内":     "小倉",
	"福岡市内":      "博多",
}

// SpecialZoneRegistry は駅名から所属する特例ゾーンを高速に引くためのレジストリです。
type SpecialZoneRegistry struct {
	Zones          []ticketdomain.SpecialZone
	StationToZones map[string][]ticketdomain.SpecialZone
}

// LoadSpecialZones はJSONから特例ゾーン定義を読み込み、レジストリを構築します。
func LoadSpecialZones() (*SpecialZoneRegistry, error) {
	reader := graphdata.GetSpecialZonesReader()
	data, err := io.ReadAll(reader)
	if err != nil {
		return nil, fmt.Errorf("LoadSpecialZones: 読み込み失敗: %w", err)
	}

	var rawZones []rawSpecialZone
	if err := json.Unmarshal(data, &rawZones); err != nil {
		return nil, fmt.Errorf("LoadSpecialZones: JSONパース失敗: %w", err)
	}

	registry := &SpecialZoneRegistry{
		Zones:          make([]ticketdomain.SpecialZone, 0, len(rawZones)),
		StationToZones: make(map[string][]ticketdomain.SpecialZone),
	}

	for _, rz := range rawZones {
		zone := ticketdomain.SpecialZone{
			Name:                rz.Name,
			MinDistanceDeciKilo: domain.DeciKilo(rz.MinDistanceDeciKilo),
			MaxDistanceDeciKilo: domain.DeciKilo(rz.MaxDistanceDeciKilo),
			Stations:            rz.Stations,
		}
		registry.Zones = append(registry.Zones, zone)

		for _, station := range rz.Stations {
			registry.StationToZones[station] = append(registry.StationToZones[station], zone)
		}
	}

	return registry, nil
}

// FindZonesByStation は指定された駅名が属する特例ゾーンのリストを返します。
// 厳しい条件（MinDistanceが大きいもの）から順に評価できるよう、
// 呼び出し側で並び替えや優先度付けを行うためのベースデータを返します。
// 今回の実装ではリストの順序はJSONの定義順に依存します。
func (r *SpecialZoneRegistry) FindZonesByStation(station string) []ticketdomain.SpecialZone {
	return r.StationToZones[station]
}

// FindZoneByName はゾーン名から特例ゾーンを取得します。
func (r *SpecialZoneRegistry) FindZoneByName(name string) *ticketdomain.SpecialZone {
	for _, z := range r.Zones {
		if z.Name == name {
			return &z
		}
	}
	return nil
}
