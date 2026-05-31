package graphio

import (
	"encoding/gob"
	"errors"
	"fmt"
	"io"
	"split-pass-api/internal/graph"
)

var ErrEmptyGraph = errors.New("グラフデータが空です")

// GobLoader はバイナリ（gob）形式からグラフをロードします。
type GobLoader struct{}

// Load はバイナリ形式のデータを読み込み、Graph を返します。
// デシリアライズ後に内部データが nil の場合はエラーを返します。
func (l *GobLoader) Load(r io.Reader) (*graph.Graph, error) {
	var g graph.Graph
	if err := gob.NewDecoder(r).Decode(&g); err != nil {
		return nil, fmt.Errorf("graphio: gobのデコードに失敗しました: %w", err)
	}

	if err := g.Validate(); err != nil {
		return nil, fmt.Errorf("graphio: %w", err)
	}

	return &g, nil
}

// SaveBinary はグラフ全体をバイナリ形式で書き込みます。
func SaveBinary(g *graph.Graph, w io.Writer) error {
	if err := g.Validate(); err != nil {
		return fmt.Errorf("graphio: 保存前の検証に失敗しました: %w", err)
	}

	if err := gob.NewEncoder(w).Encode(g); err != nil {
		return fmt.Errorf("graphio: gobのエンコードに失敗しました: %w", err)
	}

	return nil
}
