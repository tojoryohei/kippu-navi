package data

import (
	"encoding/binary"
	"fmt"
	"os"
)

// LoadPrecomputedTicketFares は事前計算された乗車券運賃データを読み込みます
func LoadPrecomputedTicketFares(filepath string) ([]int32, int32, error) {
	file, err := os.Open(filepath)
	if err != nil {
		return nil, 0, fmt.Errorf("ファイルのオープンに失敗しました: %w", err)
	}
	defer file.Close()

	var magic [8]byte
	if err := binary.Read(file, binary.LittleEndian, &magic); err != nil {
		return nil, 0, fmt.Errorf("マジックナンバーの読み込みに失敗しました: %w", err)
	}

	expectedMagic := [8]byte{'T', 'K', 'S', 'R', 'V', 'B', 0, 0}
	if magic != expectedMagic {
		return nil, 0, fmt.Errorf("無効なマジックナンバーです: %v", magic)
	}

	var numStations int32
	if err := binary.Read(file, binary.LittleEndian, &numStations); err != nil {
		return nil, 0, fmt.Errorf("駅数の読み込みに失敗しました: %w", err)
	}

	var padding [4]byte
	if err := binary.Read(file, binary.LittleEndian, &padding); err != nil {
		return nil, 0, fmt.Errorf("パディングの読み込みに失敗しました: %w", err)
	}

	fares := make([]int32, numStations*numStations)
	if err := binary.Read(file, binary.LittleEndian, &fares); err != nil {
		return nil, 0, fmt.Errorf("運賃データの読み込みに失敗しました: %w", err)
	}

	return fares, numStations, nil
}
