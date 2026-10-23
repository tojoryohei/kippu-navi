package usecase

import (
	"calculation-engine/internal/ticket/graph"
	"io"
	"os"
	"strings"
	"testing"
)

func TestCheapestViaLogUsesResultPath(t *testing.T) {
	g := graph.NewGraph(4)
	path := []int{g.GetOrAddID("東中野"), g.GetOrAddID("中野"), g.GetOrAddID("西船橋"), g.GetOrAddID("船橋")}
	input := []ViaStep{{"東京", "シンカ"}, {"新大阪", ""}}
	if logged := captureViaLog(t, func() { GetCalculatedFareVia("cheapest", input, nil, path, path, g, nil) }); logged != "" {
		t.Fatalf("経由表示の生成でログが出力されました: %q", logged)
	}
	logged := captureViaLog(t, func() { logCalculatedFareViaKanas("cheapest", input, nil, path, g) })
	if logged != "カナコード：[\"チユト\",\"4608\",\"4614\",\"ソウフ\"]\n" {
		t.Fatalf("結果経路のログが不正です: %q", logged)
	}
}

// stdoutを使うため、このテスト群は並列実行しない。
func captureViaLog(t *testing.T, run func()) string {
	t.Helper()
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = reader.Close() }()
	original := os.Stdout
	os.Stdout = writer
	defer func() {
		os.Stdout = original
		_ = writer.Close()
	}()
	var output strings.Builder
	done := make(chan error, 1)
	go func() {
		_, err := io.Copy(&output, reader)
		done <- err
	}()
	run()
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	os.Stdout = original
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	return output.String()
}
