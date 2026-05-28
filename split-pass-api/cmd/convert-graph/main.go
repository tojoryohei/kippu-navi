package main

import (
	"log"
	"os"
	"split-pass-api/internal/infra/graphio"
)

func main() {
	if len(os.Args) < 3 {
		log.Fatal("Usage: convert-graph <input_json> <output_gob>")
	}

	inputJSON := os.Args[1]
	outputGOB := os.Args[2]

	log.Printf("JSONファイルを読み込んでいます: %s", inputJSON)
	jsonLoader := &graphio.JSONLoader{}
	g, err := jsonLoader.Load(inputJSON)
	if err != nil {
		log.Fatalf("JSONの読み込みに失敗しました: %v", err)
	}

	log.Printf("バイナリファイルを保存しています: %s", outputGOB)
	if err := graphio.SaveBinary(g, outputGOB); err != nil {
		log.Fatalf("バイナリの保存に失敗しました: %v", err)
	}

	log.Println("変換が完了しました。")

	log.Printf("検証のためにバイナリを再読み込みします...")
	gobLoader := &graphio.GobLoader{}
	g2, err := gobLoader.Load(outputGOB)
	if err != nil {
		log.Fatalf("バイナリの再読み込みに失敗しました: %v", err)
	}
	log.Printf("読み込み完了: 駅数 = %d", len(g2.IDToName))
}
