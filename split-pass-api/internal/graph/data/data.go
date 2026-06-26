package data

import (
	"bytes"
	_ "embed"
	"fmt"
	"os"
	"unsafe"
)

//go:embed edges.json
var edgesJSON []byte

// GetEdgesReader はグラフデータ(edges.json)のReaderを返すゲッターメソッドです。
func GetEdgesReader() *bytes.Reader {
	return bytes.NewReader(edgesJSON)
}

var (
	mmapData    []byte
	mmapFileObj *os.File
)

// LoadPrecomputedFares は事前計算されたバイナリデータを mmap を用いてロードし、Zero-copy で復元します。
func LoadPrecomputedFares(path string) (
	baseFares []int32,
	icFares []int32,
	baseDistGisei []uint16,
	icDistGisei []uint16,
	numStations int32,
	err error,
) {
	data, file, err := mmapFile(path)
	if err != nil {
		return nil, nil, nil, nil, 0, err
	}
	mmapData = data
	mmapFileObj = file

	if len(mmapData) < 16 {
		ClosePrecomputedFares()
		return nil, nil, nil, nil, 0, fmt.Errorf("data: ファイルサイズが小さすぎます")
	}

	// 1. Magic check (8 bytes / アライメント調整済)
	magic := string(mmapData[:8])
	if magic != "SRVRBIN\x00" {
		ClosePrecomputedFares()
		return nil, nil, nil, nil, 0, fmt.Errorf("data: 不正なマジックヘッダーです: %q", magic)
	}

	// 2. Read numStations (4 bytes / オフセット8から始まるためアライメント適合)
	numStations = *(*int32)(unsafe.Pointer(&mmapData[8]))

	size := int(3 * numStations * numStations)
	flatSize := int(numStations * numStations)

	// 各データのオフセット計算
	offsetBaseFares := 16 // マジック(8) + 駅数(4) + パディング(4) = 16 (16バイトアライメント)
	offsetIcFares := offsetBaseFares + size*4
	offsetBaseDist := offsetIcFares + size*4
	offsetIcDist := offsetBaseDist + flatSize*2
	requiredSize := offsetIcDist + flatSize*2

	if len(mmapData) < requiredSize {
		ClosePrecomputedFares()
		return nil, nil, nil, nil, 0, fmt.Errorf("data: ファイルサイズが不足しています (期待: %d, 実際: %d)", requiredSize, len(mmapData))
	}

	// 3. Zero-copy casting using unsafe.Slice with alignment verification
	baseFares = unsafe.Slice((*int32)(unsafe.Pointer(&mmapData[offsetBaseFares])), size)
	icFares = unsafe.Slice((*int32)(unsafe.Pointer(&mmapData[offsetIcFares])), size)
	baseDistGisei = unsafe.Slice((*uint16)(unsafe.Pointer(&mmapData[offsetBaseDist])), flatSize)
	icDistGisei = unsafe.Slice((*uint16)(unsafe.Pointer(&mmapData[offsetIcDist])), flatSize)

	return baseFares, icFares, baseDistGisei, icDistGisei, numStations, nil
}

// ClosePrecomputedFares はマッピングされたメモリとファイルディスクリプタを解放します。
func ClosePrecomputedFares() {
	if mmapData != nil {
		munmapFile(mmapData)
		mmapData = nil
	}
	if mmapFileObj != nil {
		mmapFileObj.Close()
		mmapFileObj = nil
	}
}
