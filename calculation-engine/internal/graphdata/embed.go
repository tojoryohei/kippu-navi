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
