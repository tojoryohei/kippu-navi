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
		graphdata.GetFareGraphEdgeReaders(),
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

	// 東京発着の環状経路を、同駅間の最短経路1駅に縮めない。
	loopNames := []string{
		"東京", "有楽町", "新橋", "浜松町", "田町", "高輪ゲートウェイ", "品川",
		"大崎", "五反田", "目黒", "恵比寿", "渋谷", "原宿", "代々木", "新宿",
		"新大久保", "高田馬場", "目白", "池袋", "大塚", "巣鴨", "駒込", "田端",
		"西日暮里", "日暮里", "鶯谷", "上野", "御徒町", "秋葉原", "神田", "東京",
	}

	tests := []struct {
		name           string
		inputNames     []string
		expectedNames  []string
		expectComplete bool
	}{
		{
			name:           "同駅発着の環状経路を保持する",
			inputNames:     loopNames,
			expectedNames:  loopNames,
			expectComplete: true,
		},
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
				t.Errorf("IsSuburbanAreaCompleteの期待値は%vですが、実際は%vでした", tc.expectComplete, gotComplete)
			}

			// 補正処理のテスト
			gotPath, err := c.Correct(inputPath, g)
			if err != nil {
				t.Fatalf("予期しないエラーが発生しました: %v", err)
			}

			// 完結している場合は最短経路に、そうでない場合は元の経路そのままになる
			if tc.expectComplete {
				if !reflect.DeepEqual(gotPath, expectedPath) {
					t.Errorf("経路の期待値は%vですが、実際は%vでした", expectedPath, gotPath)
				}
			} else {
				if !reflect.DeepEqual(gotPath, inputPath) {
					t.Errorf("経路が変更されないことを期待しました: 期待値%v、実際%v", inputPath, gotPath)
				}
			}
		})
	}
}
