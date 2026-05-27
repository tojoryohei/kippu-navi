package main

import (
	"log"
	"os"
	"split-pass-api/internal/graph"
)

func main() {
	if len(os.Args) < 3 {
		log.Fatal("Usage: convert-graph <input_json> <output_gob>")
	}

	inputJSON := os.Args[1]
	outputGOB := os.Args[2]

	g := graph.NewGraph(10000)

	log.Printf("JSONファイルを読み込んでいます: %s", inputJSON)
	if err := g.LoadFromJSON(inputJSON); err != nil {
		log.Fatalf("JSONの読み込みに失敗しました: %v", err)
	}

	log.Printf("バイナリファイルを保存しています: %s", outputGOB)
	if err := g.SaveBinary(outputGOB); err != nil {
		log.Fatalf("バイナリの保存に失敗しました: %v", err)
	}

	log.Println("変換が完了しました。")

	// 検証
	log.Printf("検証のためにバイナリを再読み込みします...")
	g2, err := graph.LoadGraphBinary(outputGOB)
	if err != nil {
		log.Fatalf("バイナリの再読み込みに失敗しました: %v", err)
	}
	log.Printf("読み込み完了: 駅数 = %d", len(g2.IDToName))
}
