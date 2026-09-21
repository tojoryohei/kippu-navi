package data

import (
	"encoding/binary"
	"fmt"
	"os"
	"unsafe"
)

const (
	TicketBinaryMagic  = "TKSRV3\x00\x00"
	TicketSectionCount = 3
	ticketHeaderSize   = 16 + TicketSectionCount*8
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

	if len(mmapData) < ticketHeaderSize {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: ファイルサイズが小さすぎます")
	}
	if magic := string(mmapData[:8]); magic != TicketBinaryMagic {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: 不正なマジックヘッダーです: %q", magic)
	}

	numStations := int32(binary.LittleEndian.Uint32(mmapData[8:12]))
	if numStations <= 0 {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: 駅数が不正です: %d", numStations)
	}

	if got := binary.LittleEndian.Uint32(mmapData[12:16]); got != TicketSectionCount {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: セクション数が不正です: %d", got)
	}
	lengths := make([]uint64, TicketSectionCount)
	offset := ticketHeaderSize
	for i := range lengths {
		lengths[i] = binary.LittleEndian.Uint64(mmapData[16+i*8 : 24+i*8])
		if lengths[i] == 0 || lengths[i] > uint64(len(mmapData)-offset) {
			ClosePrecomputedTicketFares()
			return nil, nil, 0, fmt.Errorf("data: 必須セクション%dが欠落または破損しています", i)
		}
		offset += int(lengths[i])
	}
	if offset != len(mmapData) {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: セクション長とファイルサイズが一致しません")
	}
	flatSize := int(numStations * numStations)
	if lengths[0] != uint64(flatSize*4) || lengths[1] != uint64(flatSize*2) || lengths[2] != uint64(flatSize*2) {
		ClosePrecomputedTicketFares()
		return nil, nil, 0, fmt.Errorf("data: 行列セクションのサイズが駅数と一致しません")
	}
	offsetFares := ticketHeaderSize
	offsetDistGisei := offsetFares + int(lengths[0])

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
