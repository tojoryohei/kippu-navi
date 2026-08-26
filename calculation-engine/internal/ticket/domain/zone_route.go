package domain

import (
	"encoding/json"
	"fmt"
	"os"
)

// ZoneRoutes は特定都区市内の中心駅〜出口駅の経路配列を管理します。
// 例: map["大阪市内"]["加島"] = ["大阪", "天満", ..., "加島"]
type ZoneRoutes map[string]map[string][]string

// LoadZoneRoutes は JSON ファイルから ZoneRoutes を読み込みます。
func LoadZoneRoutes(path string) (ZoneRoutes, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("LoadZoneRoutes: failed to read file: %w", err)
	}
	return LoadZoneRoutesFromBytes(data)
}

// LoadZoneRoutesFromBytes は JSON バイト列から ZoneRoutes を読み込みます。
func LoadZoneRoutesFromBytes(data []byte) (ZoneRoutes, error) {
	var zr ZoneRoutes
	if err := json.Unmarshal(data, &zr); err != nil {
		return nil, fmt.Errorf("LoadZoneRoutesFromBytes: failed to unmarshal json: %w", err)
	}
	return zr, nil
}

// GetRoute は指定された市内ゾーンと出口駅に対する経路配列（駅名の配列）を返します。
// 見つからない場合は nil を返します。
func (zr ZoneRoutes) GetRoute(zoneName, exitStationName string) []string {
	if zoneMap, ok := zr[zoneName]; ok {
		if route, ok := zoneMap[exitStationName]; ok {
			return route
		}
	}
	return nil
}
