package data

import (
	"fmt"
	"os"
	"unsafe"
)

var (
	mmapData    []byte
	mmapFileObj *os.File
)

// LoadPrecomputedTicketFares は事前計算した乗車券運賃と物理グラフの距離をmmapで読み込みます。
func LoadPrecomputedTicketFares(filepath string) ([]int32, []uint16, int32, error) {
	data, file, err := mmapFile(filepath)
	if err != nil {
		return nil, nil, 0, err
	}
	mmapData = data
	mmapFileObj = file

	if len(mmapData) < 16 {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: ファイルサイズが小さすぎます")
	}
	if magic := string(mmapData[:8]); magic != "TKSRV2\x00\x00" {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: 不正なマジックヘッダーです: %q", magic)
	}

	numStations := *(*int32)(unsafe.Pointer(&mmapData[8]))
	if numStations <= 0 {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: 駅数が不正です: %d", numStations)
	}

	flatSize := int(numStations * numStations)
	offsetFares := 16
	offsetDistGisei := offsetFares + flatSize*4
	requiredSize := offsetDistGisei + flatSize*2
	if len(mmapData) < requiredSize {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: ファイルサイズが不足しています (期待: %d, 実際: %d)", requiredSize, len(mmapData))
	}

	fares := unsafe.Slice((*int32)(unsafe.Pointer(&mmapData[offsetFares])), flatSize)
	distGisei := unsafe.Slice((*uint16)(unsafe.Pointer(&mmapData[offsetDistGisei])), flatSize)
	return fares, distGisei, numStations, nil
}

// ClosePrecomputedTicketFares はマッピングしたデータとファイルを解放します。
func ClosePrecomputedTicketFares() {
	if mmapData != nil {
		_ = munmapFile(mmapData)
		mmapData = nil
	}
	if mmapFileObj != nil {
		_ = mmapFileObj.Close()
		mmapFileObj = nil
	}
}
