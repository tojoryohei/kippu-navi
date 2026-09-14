package graphio_test

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/infra/graphio"
	"reflect"
	"testing"
)

func TestSpecialZoneRegistry(t *testing.T) {
	buildMockRegistry := func() *graphio.SpecialZoneRegistry {
		reg := &graphio.SpecialZoneRegistry{
			Zones: []ticketdomain.SpecialZone{
				{
					Name:                "東京都区内",
					MinDistanceDeciKilo: 2000,
					MaxDistanceDeciKilo: 99999,
					Stations:            []string{"東京", "品川", "新宿", "池袋"},
				},
				{
					Name:                "東京山手線内",
					MinDistanceDeciKilo: 1000,
					MaxDistanceDeciKilo: 2000,
					Stations:            []string{"東京", "品川", "新宿"},
				},
			},
			StationToZones: make(map[string][]ticketdomain.SpecialZone),
		}
		for _, z := range reg.Zones {
			for _, s := range z.Stations {
				reg.StationToZones[s] = append(reg.StationToZones[s], z)
			}
		}
		return reg
	}

	reg := buildMockRegistry()

	t.Run("FindZonesByStation", func(t *testing.T) {
		tests := []struct {
			station   string
			wantZones []string // 期待されるゾーン名のリスト
		}{
			{
				station:   "新宿",
				wantZones: []string{"東京都区内", "東京山手線内"},
			},
			{
				station:   "池袋",
				wantZones: []string{"東京都区内"},
			},
			{
				station:   "横浜",
				wantZones: nil, // 存在しない駅
			},
		}

		for _, tt := range tests {
			t.Run(tt.station, func(t *testing.T) {
				zones := reg.FindZonesByStation(tt.station)
				var gotNames []string
				for _, z := range zones {
					gotNames = append(gotNames, z.Name)
				}
				if !reflect.DeepEqual(gotNames, tt.wantZones) {
					t.Errorf("FindZonesByStation() = %v, want %v", gotNames, tt.wantZones)
				}
			})
		}
	})

	t.Run("FindZoneByName", func(t *testing.T) {
		tests := []struct {
			name        string
			wantNil     bool
			wantMinDist domain.DeciKilo
		}{
			{"東京都区内", false, 2000},
			{"存在しないゾーン", true, 0},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				zone := reg.FindZoneByName(tt.name)
				if (zone == nil) != tt.wantNil {
					t.Errorf("FindZoneByName() returned nil = %v, want %v", zone == nil, tt.wantNil)
					return
				}
				if zone != nil && zone.MinDistanceDeciKilo != tt.wantMinDist {
					t.Errorf("FindZoneByName() MinDistance = %v, want %v", zone.MinDistanceDeciKilo, tt.wantMinDist)
				}
			})
		}
	})
}
