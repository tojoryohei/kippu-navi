package main

import (
	"bytes"
	"encoding/binary"
	"log"
	"os"

	"split-pass-api/internal/infra/graphio"
)

// EdgeBinary はWasmにZero-copyキャストで渡すための辺構造体。
// 16バイト固定サイズで、メモリアライメントを完全に統一。
type EdgeBinary struct {
	ToID                   int32   // 4 bytes
	EigyoKilo              int16   // 2 bytes
	GiseiKilo              int16   // 2 bytes
	Company                int16   // 2 bytes
	IsLocal                bool    // 1 byte
	IsTrainSpecificSection bool    // 1 byte
	IsBarrierFreeSection   bool    // 1 byte
	IsIcPassArea           bool    // 1 byte
	Pad                    [2]byte // 2 bytes
}

func main() {
	if len(os.Args) < 3 {
		log.Fatalf("使用法: precompute-wasm-data <入力JSON> <出力WASM_BIN>")
	}

	inputJSON := os.Args[1]
	outputWasmBin := os.Args[2]

	log.Printf("JSONを読み込んでいます: %s", inputJSON)
	inFile, err := os.Open(inputJSON)
	if err != nil {
		log.Fatalf("JSONのオープンに失敗しました: %v", err)
	}
	defer inFile.Close()

	jsonLoader := &graphio.JSONLoader{}
	g, err := jsonLoader.Load(inFile)
	if err != nil {
		log.Fatalf("JSONのロードに失敗しました: %v", err)
	}

	numStations := int32(g.NumStations())
	indptr := make([]int32, numStations+1)
	var indices []int32
	var edgeData []EdgeBinary

	currEdgeCount := int32(0)
	for i := 0; i < int(numStations); i++ {
		indptr[i] = currEdgeCount
		edges := g.GetEdges(i)
		for _, e := range edges {
			indices = append(indices, int32(e.ToID))

			var eb EdgeBinary
			eb.ToID = int32(e.ToID)
			eb.EigyoKilo = int16(e.EigyoKilo)
			eb.GiseiKilo = int16(e.GiseiKilo)
			eb.Company = int16(e.Company)
			eb.IsLocal = e.IsLocal
			eb.IsTrainSpecificSection = e.IsTrainSpecificSection
			eb.IsBarrierFreeSection = e.IsBarrierFreeSection
			eb.IsIcPassArea = e.IsIcPassArea

			edgeData = append(edgeData, eb)
			currEdgeCount++
		}
	}
	indptr[numStations] = currEdgeCount
	numEdges := currEdgeCount

	log.Printf("駅数 = %d, 辺数 = %d", numStations, numEdges)

	// 駅名リスト (namesBlob / offsets) の構築
	nameOffsets := make([]int32, numStations+1)
	var namesBlob bytes.Buffer
	for i := 0; i < int(numStations); i++ {
		nameOffsets[i] = int32(namesBlob.Len())
		namesBlob.WriteString(g.GetName(i))
	}
	nameOffsets[numStations] = int32(namesBlob.Len())

	log.Printf("バイナリデータを書き出しています: %s", outputWasmBin)
	outFile, err := os.Create(outputWasmBin)
	if err != nil {
		log.Fatalf("出力ファイルの作成に失敗しました: %v", err)
	}
	defer outFile.Close()

	// 1. Magic Header: 8 bytes
	magic := [8]byte{'W', 'A', 'S', 'M', 'G', 'R', 'A', 0}
	if _, err := outFile.Write(magic[:]); err != nil {
		log.Fatalf("Magicの書き込みに失敗しました: %v", err)
	}

	// 2. NumStations: 4 bytes (int32)
	if err := binary.Write(outFile, binary.LittleEndian, numStations); err != nil {
		log.Fatalf("駅数の書き込みに失敗しました: %v", err)
	}

	// 3. NumEdges: 4 bytes (int32)
	if err := binary.Write(outFile, binary.LittleEndian, numEdges); err != nil {
		log.Fatalf("辺数の書き込みに失敗しました: %v", err)
	}

	// これで合計 16バイト。16バイトのオフセットから int32 データが始まるため、アライメント適合。

	// 4. indptr: (numStations + 1) * 4 bytes
	if err := binary.Write(outFile, binary.LittleEndian, indptr); err != nil {
		log.Fatalf("indptrの書き込みに失敗しました: %v", err)
	}

	// 5. indices: numEdges * 4 bytes
	if err := binary.Write(outFile, binary.LittleEndian, indices); err != nil {
		log.Fatalf("indicesの書き込みに失敗しました: %v", err)
	}

	// 6. edgeData: numEdges * 16 bytes
	if err := binary.Write(outFile, binary.LittleEndian, edgeData); err != nil {
		log.Fatalf("edgeDataの書き込みに失敗しました: %v", err)
	}

	// 7. nameOffsets: (numStations + 1) * 4 bytes
	if err := binary.Write(outFile, binary.LittleEndian, nameOffsets); err != nil {
		log.Fatalf("nameOffsetsの書き込みに失敗しました: %v", err)
	}

	// 8. namesBlob: string length bytes
	if _, err := outFile.Write(namesBlob.Bytes()); err != nil {
		log.Fatalf("namesBlobの書き込みに失敗しました: %v", err)
	}

	log.Println("Wasm用事前計算データが完了しました。")
}
