package data

import (
	"bytes"
	"compress/gzip"
	_ "embed"
	"encoding/binary"
	"fmt"
	"io"
	"unsafe"
)

//go:embed edges.json
var edgesJSON []byte

//go:embed precomputed_fares.bin.gz
var precomputedFaresGZ []byte

//go:embed precomputed_paths.bin.gz
var precomputedPathsGZ []byte

// GetEdgesReader はグラフデータ(edges.json)のReaderを返すゲッターメソッドです。
func GetEdgesReader() *bytes.Reader {
	return bytes.NewReader(edgesJSON)
}

// LoadPrecomputedFares は事前計算されたバイナリデータをロードして復元します。
func LoadPrecomputedFares() (
	baseFares []int32,
	icFares []int32,
	basePrevGisei []int16,
	basePrevEigyo []int16,
	baseDistGisei []uint16,
	baseDistEigyo []uint16,
	icPrevGisei []int16,
	icPrevEigyo []int16,
	icDistGisei []uint16,
	icDistEigyo []uint16,
	numStations int32,
	err error,
) {
	if len(precomputedFaresGZ) == 0 {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("precomputed_fares.bin.gz が空か、または見つかりません")
	}
	if len(precomputedPathsGZ) == 0 {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("precomputed_paths.bin.gz が空か、または見つかりません")
	}

	// 1. Load Fares
	gzReader, err := gzip.NewReader(bytes.NewReader(precomputedFaresGZ))
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("fares gzipデコンプレッサの作成に失敗しました: %w", err)
	}
	defer gzReader.Close()

	magic := make([]byte, 5)
	if _, err := io.ReadFull(gzReader, magic); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("fares マジックヘッダーの読み込みに失敗しました: %w", err)
	}
	if string(magic) != "FARES" {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("不正なfaresマジックヘッダーです: %s", string(magic))
	}

	if err := binary.Read(gzReader, binary.LittleEndian, &numStations); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("駅数の読み込みに失敗しました: %w", err)
	}

	size := int(3 * numStations * numStations)
	flatSize := int(numStations * numStations)

	baseFares = make([]int32, size)
	baseFaresBytes := unsafe.Slice((*byte)(unsafe.Pointer(&baseFares[0])), size*4)
	if _, err := io.ReadFull(gzReader, baseFaresBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("BaseFaresデータの読み込みに失敗しました: %w", err)
	}

	icFares = make([]int32, size)
	icFaresBytes := unsafe.Slice((*byte)(unsafe.Pointer(&icFares[0])), size*4)
	if _, err := io.ReadFull(gzReader, icFaresBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("IcFaresデータの読み込みに失敗しました: %w", err)
	}

	// 2. Load Paths
	gzPathsReader, err := gzip.NewReader(bytes.NewReader(precomputedPathsGZ))
	if err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("paths gzipデコンプレッサの作成に失敗しました: %w", err)
	}
	defer gzPathsReader.Close()

	magicPaths := make([]byte, 5)
	if _, err := io.ReadFull(gzPathsReader, magicPaths); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("paths マジックヘッダーの読み込みに失敗しました: %w", err)
	}
	if string(magicPaths) != "PATHS" {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("不正なpathsマジックヘッダーです: %s", string(magicPaths))
	}

	var numStationsPaths int32
	if err := binary.Read(gzPathsReader, binary.LittleEndian, &numStationsPaths); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("paths 駅数の読み込みに失敗しました: %w", err)
	}
	if numStationsPaths != numStations {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("ファイル間の駅数不整合: %d vs %d", numStations, numStationsPaths)
	}

	basePrevGisei = make([]int16, flatSize)
	basePrevGiseiBytes := unsafe.Slice((*byte)(unsafe.Pointer(&basePrevGisei[0])), flatSize*2)
	if _, err := io.ReadFull(gzPathsReader, basePrevGiseiBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("BasePrevGiseiの読み込みに失敗しました: %w", err)
	}

	basePrevEigyo = make([]int16, flatSize)
	basePrevEigyoBytes := unsafe.Slice((*byte)(unsafe.Pointer(&basePrevEigyo[0])), flatSize*2)
	if _, err := io.ReadFull(gzPathsReader, basePrevEigyoBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("BasePrevEigyoの読み込みに失敗しました: %w", err)
	}

	baseDistGisei = make([]uint16, flatSize)
	baseDistGiseiBytes := unsafe.Slice((*byte)(unsafe.Pointer(&baseDistGisei[0])), flatSize*2)
	if _, err := io.ReadFull(gzPathsReader, baseDistGiseiBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("BaseDistGiseiの読み込みに失敗しました: %w", err)
	}

	baseDistEigyo = make([]uint16, flatSize)
	baseDistEigyoBytes := unsafe.Slice((*byte)(unsafe.Pointer(&baseDistEigyo[0])), flatSize*2)
	if _, err := io.ReadFull(gzPathsReader, baseDistEigyoBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("BaseDistEigyoの読み込みに失敗しました: %w", err)
	}

	icPrevGisei = make([]int16, flatSize)
	icPrevGiseiBytes := unsafe.Slice((*byte)(unsafe.Pointer(&icPrevGisei[0])), flatSize*2)
	if _, err := io.ReadFull(gzPathsReader, icPrevGiseiBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("IcPrevGiseiの読み込みに失敗しました: %w", err)
	}

	icPrevEigyo = make([]int16, flatSize)
	icPrevEigyoBytes := unsafe.Slice((*byte)(unsafe.Pointer(&icPrevEigyo[0])), flatSize*2)
	if _, err := io.ReadFull(gzPathsReader, icPrevEigyoBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("IcPrevEigyoの読み込みに失敗しました: %w", err)
	}

	icDistGisei = make([]uint16, flatSize)
	icDistGiseiBytes := unsafe.Slice((*byte)(unsafe.Pointer(&icDistGisei[0])), flatSize*2)
	if _, err := io.ReadFull(gzPathsReader, icDistGiseiBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("IcDistGiseiの読み込みに失敗しました: %w", err)
	}

	icDistEigyo = make([]uint16, flatSize)
	icDistEigyoBytes := unsafe.Slice((*byte)(unsafe.Pointer(&icDistEigyo[0])), flatSize*2)
	if _, err := io.ReadFull(gzPathsReader, icDistEigyoBytes); err != nil {
		return nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 0, fmt.Errorf("IcDistEigyoの読み込みに失敗しました: %w", err)
	}

	return baseFares, icFares,
		basePrevGisei, basePrevEigyo, baseDistGisei, baseDistEigyo,
		icPrevGisei, icPrevEigyo, icDistGisei, icDistEigyo,
		numStations, nil
}
