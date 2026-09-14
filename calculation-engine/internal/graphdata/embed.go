package graphdata

import (
	"bytes"
	_ "embed"
	"io"
)

//go:embed edges.json
var edgesJSON []byte

//go:embed shinkansen_edges.json
var shinkansenEdgesJSON []byte

//go:embed connecting_edges.json
var connectingEdgesJSON []byte

//go:embed special_zones.json
var specialZonesJSON []byte

//go:embed zone_routes.json
var zoneRoutesJSON []byte

// GetEdgesReader はグラフデータ(edges.json)のReaderを返すゲッターメソッドです。
func GetEdgesReader() *bytes.Reader {
	return bytes.NewReader(edgesJSON)
}

// GetShinkansenEdgesReader は新幹線の運賃計算用エッジデータ(shinkansen_edges.json)のReaderを返します。
func GetShinkansenEdgesReader() *bytes.Reader {
	return bytes.NewReader(shinkansenEdgesJSON)
}

// GetConnectingEdgesReader は連絡会社線・私鉄の運賃計算用エッジデータ(connecting_edges.json)のReaderを返します。
func GetConnectingEdgesReader() *bytes.Reader {
	return bytes.NewReader(connectingEdgesJSON)
}

// GetFareGraphEdgeReaders は運賃計算用フルグラフへ追加するエッジを、元データと同じ順序で返します。
func GetFareGraphEdgeReaders() []io.Reader {
	return []io.Reader{GetShinkansenEdgesReader(), GetConnectingEdgesReader()}
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
