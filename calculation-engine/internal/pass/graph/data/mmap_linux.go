//go:build linux

package data

import (
	"fmt"
	"os"
	"syscall"
)

// mmapFile は指定されたファイルをメモリマッピングします。
func mmapFile(path string) ([]byte, *os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("mmap: ファイルのオープンに失敗しました: %w", err)
	}

	fi, err := file.Stat()
	if err != nil {
		file.Close()
		return nil, nil, fmt.Errorf("mmap: ファイル情報の取得に失敗しました: %w", err)
	}

	size := fi.Size()
	if size == 0 {
		file.Close()
		return nil, nil, fmt.Errorf("mmap: 空のファイルはマッピングできません")
	}

	data, err := syscall.Mmap(int(file.Fd()), 0, int(size), syscall.PROT_READ, syscall.MAP_SHARED)
	if err != nil {
		file.Close()
		return nil, nil, fmt.Errorf("mmap: メモリマッピングに失敗しました: %w", err)
	}

	return data, file, nil
}

// munmapFile はマッピングされたメモリを解放します。
func munmapFile(data []byte) error {
	if err := syscall.Munmap(data); err != nil {
		return fmt.Errorf("mmap: メモリ解放に失敗しました: %w", err)
	}
	return nil
}
