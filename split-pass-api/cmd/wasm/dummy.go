//go:build !js || !wasm

package main

// このファイルは、js/wasm以外のプラットフォームで go test ./... を実行した際に、
// cmd/wasm パッケージ内にビルド可能なGoファイルが1つも存在しないために発生する
// [setup failed] エラーを回避するためのダミー実装です。
func main() {}
