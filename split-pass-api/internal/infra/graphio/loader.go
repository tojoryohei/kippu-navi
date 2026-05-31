package graphio

import (
	"io"
	"split-pass-api/internal/graph"
)

// Loader はグラフをロードするインターフェースです。
// JSON・Gobなど形式の異なる実装を統一的に扱えます。
type Loader interface {
	Load(r io.Reader) (*graph.Graph, error)
}
