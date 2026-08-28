package graphdata

import (
	"bytes"
	_ "embed"
)

//go:embed edges.json
var edgesJSON []byte

//go:embed virtual_edges.json
var virtualEdgesJSON []byte

//go:embed special_zones.json
var specialZonesJSON []byte

//go:embed zone_routes.json
var zoneRoutesJSON []byte

// GetEdgesReader はグラフデータ(edges.json)のReaderを返すゲッターメソッドです。
func GetEdgesReader() *bytes.Reader {
	return bytes.NewReader(edgesJSON)
}

// GetVirtualEdgesReader は仮想エッジデータ(virtual_edges.json)のReaderを返すゲッターメソッドです。
func GetVirtualEdgesReader() *bytes.Reader {
	return bytes.NewReader(virtualEdgesJSON)
}

// GetSpecialZonesReader は特定都区市内データ(special_zones.json)のReaderを返すゲッターメソッドです。
func GetSpecialZonesReader() *bytes.Reader {
	return bytes.NewReader(specialZonesJSON)
}

// GetZoneRoutesReader は特定都区市内などのルートデータ(zone_routes.json)のReaderを返すゲッターメソッドです。
func GetZoneRoutesReader() *bytes.Reader {
	return bytes.NewReader(zoneRoutesJSON)
}

//go:embed article70_routes.json
var article70RoutesJSON []byte

// GetArticle70RoutesReader は70条特例のルートデータ(article70_routes.json)のReaderを返すゲッターメソッドです。
func GetArticle70RoutesReader() *bytes.Reader {
	return bytes.NewReader(article70RoutesJSON)
}
