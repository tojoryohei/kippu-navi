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

// GetEdgesReader はグラフデータ(edges.json)のReaderを返すゲッターメソッドです。
func GetEdgesReader() *bytes.Reader {
	return bytes.NewReader(edgesJSON)
}

// LoadPrecomputedFares は事前計算された運賃バイナリデータをロードして復元します。
func LoadPrecomputedFares() ([]int32, []int32, int32, error) {
	if len(precomputedFaresGZ) == 0 {
		return nil, nil, 0, fmt.Errorf("precomputed_fares.bin.gz が空か、または見つかりません")
	}

	gzReader, err := gzip.NewReader(bytes.NewReader(precomputedFaresGZ))
	if err != nil {
		return nil, nil, 0, fmt.Errorf("gzipデコンプレッサの作成に失敗しました: %w", err)
	}
	defer gzReader.Close()

	magic := make([]byte, 5)
	if _, err := io.ReadFull(gzReader, magic); err != nil {
		return nil, nil, 0, fmt.Errorf("マジックヘッダーの読み込みに失敗しました: %w", err)
	}
	if string(magic) != "FARES" {
		return nil, nil, 0, fmt.Errorf("不正なマジックヘッダーです: %s", string(magic))
	}

	var numStations int32
	if err := binary.Read(gzReader, binary.LittleEndian, &numStations); err != nil {
		return nil, nil, 0, fmt.Errorf("駅数の読み込みに失敗しました: %w", err)
	}

	size := int(3 * numStations * numStations)
	
	// BaseFaresの読み込み
	baseBytes := make([]byte, size*4)
	if _, err := io.ReadFull(gzReader, baseBytes); err != nil {
		return nil, nil, 0, fmt.Errorf("BaseFaresデータの読み込みに失敗しました: %w", err)
	}

	// IcFaresの読み込み
	icBytes := make([]byte, size*4)
	if _, err := io.ReadFull(gzReader, icBytes); err != nil {
		return nil, nil, 0, fmt.Errorf("IcFaresデータの読み込みに失敗しました: %w", err)
	}

	// unsafe を用いた []byte から []int32 へのゼロコピーキャスト
	baseFares := unsafe.Slice((*int32)(unsafe.Pointer(&baseBytes[0])), size)
	icFares := unsafe.Slice((*int32)(unsafe.Pointer(&icBytes[0])), size)

	return baseFares, icFares, numStations, nil
}
