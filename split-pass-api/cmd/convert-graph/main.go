package main

import (
	"fmt"
	"log"
	"os"
	"split-pass-api/internal/infra/graphio"
)

func main() {
	if err := run(os.Args); err != nil {
		log.Fatalf("エラーが発生しました: %v", err)
	}
	log.Println("変換が完了しました。")
}

func run(args []string) error {
	if len(args) < 3 {
		return fmt.Errorf("使用法: convert-graph <入力JSON> <出力GOB>")
	}

	inputJSON := args[1]
	outputGOB := args[2]

	log.Printf("JSONファイルを読み込んでいます: %s", inputJSON)
	inFile, err := os.Open(inputJSON)
	if err != nil {
		return fmt.Errorf("JSONファイルのオープンに失敗しました: %w", err)
	}
	defer inFile.Close()

	jsonLoader := &graphio.JSONLoader{}
	g, err := jsonLoader.Load(inFile)
	if err != nil {
		return fmt.Errorf("JSONの読み込みに失敗しました: %w", err)
	}

	log.Printf("バイナリファイルを保存しています: %s", outputGOB)
	outGobFile, err := os.Create(outputGOB)
	if err != nil {
		return fmt.Errorf("バイナリファイルの作成に失敗しました: %w", err)
	}
	defer outGobFile.Close()

	if err := graphio.SaveBinary(g, outGobFile); err != nil {
		return fmt.Errorf("バイナリの保存に失敗しました: %w", err)
	}

	log.Printf("検証のためにバイナリを再読み込みします...")
	outFile, err := os.Open(outputGOB)
	if err != nil {
		return fmt.Errorf("バイナリファイルのオープンに失敗しました: %w", err)
	}
	defer outFile.Close()

	gobLoader := &graphio.GobLoader{}
	g2, err := gobLoader.Load(outFile)
	if err != nil {
		return fmt.Errorf("バイナリの再読み込みに失敗しました: %w", err)
	}
	log.Printf("読み込み完了: 駅数 = %d", g2.NumStations())

	return nil
}
