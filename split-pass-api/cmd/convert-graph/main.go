package main

import (
	"fmt"
	"log"
	"os"
	"split-pass-api/internal/infra/graphio"
)

func main() {
	// os.Argsを明示的に渡すことで、run関数のテストを容易にする
	if err := run(os.Args); err != nil {
		log.Fatalf("エラーが発生しました: %v", err)
	}
	log.Println("変換が完了しました。")
}

func run(args []string) error {
	if len(args) < 3 {
		return fmt.Errorf("Usage: convert-graph <input_json> <output_gob>")
	}

	inputJSON := args[1]
	outputGOB := args[2]

	log.Printf("JSONファイルを読み込んでいます: %s", inputJSON)
	jsonLoader := &graphio.JSONLoader{}
	g, err := jsonLoader.Load(inputJSON)
	if err != nil {
		// 根本原因を失わないよう %w でエラーをラップする
		return fmt.Errorf("JSONの読み込みに失敗しました: %w", err)
	}

	log.Printf("バイナリファイルを保存しています: %s", outputGOB)
	if err := graphio.SaveBinary(g, outputGOB); err != nil {
		return fmt.Errorf("バイナリの保存に失敗しました: %w", err)
	}

	log.Printf("検証のためにバイナリを再読み込みします...")
	gobLoader := &graphio.GobLoader{}
	g2, err := gobLoader.Load(outputGOB)
	if err != nil {
		return fmt.Errorf("バイナリの再読み込みに失敗しました: %w", err)
	}
	log.Printf("読み込み完了: 駅数 = %d", len(g2.IDToName))

	return nil
}
