package data

import (
	"bytes"
	_ "embed"
)

//go:embed edges.json
var edgesJSON []byte

// GetEdgesReader はグラフデータ(edges.json)のReaderを返すゲッターメソッドです。
func GetEdgesReader() *bytes.Reader {
	return bytes.NewReader(edgesJSON)
}
