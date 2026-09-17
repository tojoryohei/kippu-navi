//go:build !linux

package data

import (
	"fmt"
	"os"
)

func mmapFile(path string) ([]byte, *os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("fallback: ファイルのオープンに失敗しました: %w", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		if closeErr := file.Close(); closeErr != nil {
			return nil, nil, fmt.Errorf("fallback: ファイルの読み込みに失敗しました: %w（ファイルのクローズにも失敗しました: %v）", err, closeErr)
		}
		return nil, nil, fmt.Errorf("fallback: ファイルの読み込みに失敗しました: %w", err)
	}
	return data, file, nil
}

func munmapFile(data []byte) error {
	return nil
}
