package ticket_test

import (
	"calculation-engine/internal/graphdata"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"io"
	"reflect"
	"testing"
)

func TestPathCorrectorIntegration(t *testing.T) {
	// 実際のグラフデータをロードする
	loader := &graphio.JSONLoader{}
	_, fullGraph, err := loader.LoadSeparatedGraphs(
		[]io.Reader{graphdata.GetEdgesReader()},
		[]io.Reader{graphdata.GetVirtualEdgesReader()},
	)
	if err != nil {
		t.Fatalf("グラフのロードに失敗しました: %v", err)
	}

	pipeline := usecase.NewPipelineCorrector(
		usecase.NewShinkansenOverlapCorrector(),
		usecase.NewPipelineCorrector(
			usecase.NewRule43_2Corrector(),
			usecase.NewRule69Corrector(),
			usecase.NewRule157Corrector(),
		),
	)

	// ヘルパー関数: 駅名のスライスからIDのスライスへの変換
	namesToIDs := func(names []string) []int {
		var ids []int
		for _, name := range names {
			id, ok := fullGraph.GetID(name)
			if !ok {
				t.Fatalf("駅名 '%s' がグラフに存在しません", name)
			}
			ids = append(ids, id)
		}
		return ids
	}

	tests := []struct {
		name     string
		input    []string
		expected []string
	}{
		{
			name:     "ユースケース1: 新幹線展開＋分岐駅通過特例による控除（御茶ノ水〜東京〜上野）",
			input:    []string{"御茶ノ水", "神田", "東京", "上野"},
			expected: []string{"御茶ノ水", "神田", "秋葉原", "御徒町", "上野"},
		},
		{
			name:     "ユースケース2: 経路特定区間の置換（新大阪〜大阪〜(西側)〜天王寺〜東部市場前）",
			input:    []string{"新大阪", "大阪", "（環）福島", "野田", "西九条", "弁天町", "大正", "芦原橋", "今宮", "新今宮", "天王寺", "東部市場前"},
			expected: []string{"新大阪", "大阪", "天満", "桜ノ宮", "京橋", "大阪城公園", "森ノ宮", "玉造", "鶴橋", "桃谷", "寺田町", "天王寺", "東部市場前"},
		},
		{
			name:     "ユースケース3: 新幹線展開からの経路特定区間置換（京都〜米原〜近江塩津〜新疋田）",
			input:    []string{"京都", "米原", "坂田", "田村", "長浜", "虎姫", "河毛", "高月", "木ノ本", "余呉", "近江塩津", "新疋田"},
			expected: []string{"京都", "山科", "大津京", "唐崎", "比叡山坂本", "おごと温泉", "堅田", "（湖）小野", "和邇", "蓬莱", "志賀", "比良", "近江舞子", "北小松", "近江高島", "安曇川", "新旭", "近江今津", "近江中庄", "マキノ", "永原", "近江塩津", "新疋田"},
		},
		{
			name:     "ユースケース4: 新幹線展開からの経路特定区間置換（諫早〜長崎〜浦上〜長与）",
			input:    []string{"諫早", "長崎", "浦上", "西浦上", "道ノ尾", "（長）高田", "長与"},
			expected: []string{"諫早", "西諫早", "喜々津", "東園", "大草", "本川内", "長与"},
		},
		{
			name:     "ユースケース5: 指定されていない方面からの経路特定区間非置換（新横浜〜品川〜(品鶴線)〜鶴見〜横浜）",
			input:    []string{"新横浜", "品川", "西大井", "武蔵小杉", "新川崎", "鶴見", "新子安", "東神奈川", "横浜"},
			expected: []string{"新横浜", "品川", "西大井", "武蔵小杉", "新川崎", "鶴見", "新子安", "東神奈川", "横浜"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inputIDs := namesToIDs(tt.input)
			expectedIDs := namesToIDs(tt.expected)

			resIDs, err := pipeline.Correct(inputIDs, fullGraph)
			if err != nil {
				t.Fatalf("予期しないエラー: %v", err)
			}

			if !reflect.DeepEqual(resIDs, expectedIDs) {
				// デバッグ用に失敗時は駅名で出力
				var resNames []string
				for _, id := range resIDs {
					resNames = append(resNames, fullGraph.GetName(id))
				}
				t.Errorf("got %v\nwant %v", resNames, tt.expected)
			}
		})
	}
}
