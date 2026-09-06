//go:build linux

package data

import (
	"fmt"
	"os"
	"syscall"
)

func mmapFile(path string) ([]byte, *os.File, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, fmt.Errorf("mmap: ファイルのオープンに失敗しました: %w", err)
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, nil, fmt.Errorf("mmap: ファイル情報の取得に失敗しました: %w", err)
	}
	if info.Size() == 0 {
		_ = file.Close()
		return nil, nil, fmt.Errorf("mmap: 空のファイルはマッピングできません")
	}
	data, err := syscall.Mmap(int(file.Fd()), 0, int(info.Size()), syscall.PROT_READ, syscall.MAP_SHARED)
	if err != nil {
		_ = file.Close()
		return nil, nil, fmt.Errorf("mmap: メモリマッピングに失敗しました: %w", err)
	}
	return data, file, nil
}

func munmapFile(data []byte) error {
	return syscall.Munmap(data)
}
