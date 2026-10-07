package usecase

import (
	"calculation-engine/internal/ticket/graph"
	"encoding/json"
	"io"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestCheapestViaLogUsesResultPath(t *testing.T) {
	for _, tc := range []struct {
		names, codes []string
	}{
		{[]string{"東中野", "中野", "西船橋", "船橋"}, []string{"チユト", "4608", "4614", "ソウフ"}},
		{[]string{"津幡", "倶利伽羅", "高岡"}, []string{"6202", "6203", "6204", "6205"}},
		{[]string{"小倉", "博多", "姪浜"}, []string{"モシコラＢ", "シンカ", "モシハカＢ", "9508", "9509"}},
		{[]string{"三島", "（東）新富士", "静岡"}, []string{"トウカ"}},
		{[]string{"博多", "新鳥栖", "久留米"}, []string{"カコシ"}},
		{[]string{"（北）福島", "白石蔵王", "仙台", "古川", "くりこま高原", "一ノ関", "水沢江刺", "北上", "新花巻", "盛岡", "いわて沼宮内", "二戸", "八戸", "七戸十和田", "新青森"}, []string{"トウホ", "モリイチＢ", "トホシ", "モリカミＢ", "トウホ", "モリモリＢ", "トホシ", "アキシアＢ"}},
	} {
		for _, reverse := range []bool{false, true} {
			names, want := tc.names, tc.codes
			if reverse {
				names, want = reverseStrings(names), reverseStrings(want)
			}
			t.Run(names[0]+"→"+names[len(names)-1], func(t *testing.T) {
				g := graph.NewGraph(len(names))
				path := make([]int, len(names))
				for i, name := range names {
					path[i] = g.GetOrAddID(name)
				}
				if got := automaticViaKanas(g, path); !reflect.DeepEqual(got, want) {
					t.Fatalf("codes = %v, want %v", got, want)
				}
				for _, input := range [][]ViaStep{nil, {{"東京", "シンカ"}, {"新大阪", ""}}} {
					var printed []string
					logged := captureViaLog(t, func() {
						printed = GetCalculatedFareVia("cheapest", input, nil, path, path, g, nil)
					})
					if logged != "" {
						t.Fatalf("printing generated a log: %q", logged)
					}
					logged = captureViaLog(t, func() {
						logCalculatedFareViaKanas("cheapest", input, nil, path, g)
					})
					encoded, err := json.Marshal(want)
					if err != nil {
						t.Fatal(err)
					}
					if logged != "カナコード："+string(encoded)+"\n" {
						t.Fatalf("log = %q, want codes %v", logged, want)
					}
					if expected := GetAutomaticFareViaForResult(g, path, path); !reflect.DeepEqual(printed, expected) {
						t.Fatalf("printing = %v, want %v", printed, expected)
					}
				}
			})
		}
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
