package ticket_test

import (
	"io"
	"reflect"
	"testing"

	"calculation-engine/internal/graphdata"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
)

func TestSuburbanAreaCorrector_Integration(t *testing.T) {
	// 1. グラフのロード
	loader := &graphio.JSONLoader{}
	_, g, err := loader.LoadSeparatedGraphs(
		[]io.Reader{graphdata.GetEdgesReader()},
		[]io.Reader{graphdata.GetVirtualEdgesReader()},
	)
	if err != nil {
		t.Fatalf("グラフデータのロードに失敗しました: %v", err)
	}

	c := usecase.NewSuburbanAreaCorrector(nil)

	// ID取得用ヘルパー
	getID := func(name string) int {
		id, ok := g.GetID(name)
		if !ok {
			t.Fatalf("駅が見つかりません: %s", name)
		}
		return id
	}

	// パス構築用ヘルパー
	buildPath := func(names ...string) []int {
		path := make([]int, len(names))
		for i, n := range names {
			path[i] = getID(n)
		}
		return path
	}

	tests := []struct {
		name           string
		inputNames     []string
		expectedNames  []string
		expectComplete bool
	}{
		{
			name:           "東京近郊区間完結の場合、最短経路に補正される",
			inputNames:     []string{"神田", "秋葉原", "御茶ノ水"}, // 秋葉原経由
			expectedNames:  []string{"神田", "御茶ノ水"},        // 最短経路 (直通)
			expectComplete: true,                          // edges.jsonに正しいSuburbanAreaが設定されているためtrueになる
		},
		{
			name:           "東京駅を跨ぐ場合（品川-東京間が新幹線直通エッジなのでfalse）",
			inputNames:     []string{"品川", "東京", "神田"},
			expectedNames:  []string{"品川", "東京", "神田"}, // そのまま
			expectComplete: false,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			inputPath := buildPath(tc.inputNames...)
			expectedPath := buildPath(tc.expectedNames...)

			// IsSuburbanAreaCompleteのテスト
			gotComplete := usecase.IsSuburbanAreaComplete(inputPath, g)
			if gotComplete != tc.expectComplete {
				t.Errorf("IsSuburbanAreaComplete expected %v, got %v", tc.expectComplete, gotComplete)
			}

			// 補正処理のテスト
			gotPath, err := c.Correct(inputPath, g)
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}

			// 完結している場合は最短経路に、そうでない場合は元の経路そのままになる
			if tc.expectComplete {
				if !reflect.DeepEqual(gotPath, expectedPath) {
					t.Errorf("expected path %v, got %v", expectedPath, gotPath)
				}
			} else {
				if !reflect.DeepEqual(gotPath, inputPath) {
					t.Errorf("expected path to remain unchanged %v, got %v", inputPath, gotPath)
				}
			}
		})
	}
}
