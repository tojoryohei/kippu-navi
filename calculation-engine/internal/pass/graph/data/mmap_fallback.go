//go:build !linux

package data

import (
	"fmt"
	"os"
)

// mmapFile は Linux 以外の環境向けに、ファイルを一括読み込みしてシミュレートします。
func mmapFile(path string) ([]byte, *os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("fallback: ファイルのオープンに失敗しました: %w", err)
	}



	data, err := os.ReadFile(path)
	if err != nil {
		file.Close()
		return nil, nil, fmt.Errorf("fallback: ファイルの読み込みに失敗しました: %w", err)
	}

	return data, file, nil
}

// munmapFile は fallback 用に何もしません。
func munmapFile(data []byte) error {
	return nil
}
