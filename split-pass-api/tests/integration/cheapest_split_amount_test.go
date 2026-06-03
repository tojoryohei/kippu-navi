package integration_test

import (
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph/data"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/infra/graphio"
	"split-pass-api/internal/optimizer"
	"split-pass-api/internal/usecase"
	"testing"
)

func TestSearchOptimalSplit_Integration(t *testing.T) {
	// 1. 環境構築 (main.go と同様のセットアップ)
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフの読み込みに失敗: %v", err)
	}

	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("運賃計算機の初期化に失敗: %v", err)
	}

	// 特例ルールの設定 (main.go と同様)
	bypassReg := domain.NewBypassRegistry()
	bypassReg.Register(
		[]string{"大沼", "大沼公園", "赤井川", "駒ケ岳", "森"},
		[]string{"大沼", "鹿部", "渡島沼尻", "渡島砂原", "掛澗", "尾白内", "東森", "森"},
	)
	bypassReg.Register(
		[]string{"日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽"},
		[]string{"日暮里", "尾久", "赤羽"},
	)
	bypassReg.Register(
		[]string{"赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"},
		[]string{"赤羽", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "大宮"},
	)
	bypassReg.Register(
		[]string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見"},
		[]string{"品川", "西大井", "武蔵小杉", "新川崎", "鶴見"},
	)

	bypassRules, err := bypassReg.ResolveIDs(func(name string) (int, bool) {
		id, ok := g.GetID(name)
		return id, ok
	})
	if err != nil {
		t.Fatalf("特例ルールの解決に失敗: %v", err)
	}

	// ユースケースの初期化
	amount := usecase.NewCalculateAmount(
		g, calcs.Registry, domain.NewAddonRegistry(), domain.NewAddonRegistry(),
		calcs.TrainSpecific, calcs.SpecificRoute, calcs.AdjustedRoute,
	)
	opt := optimizer.NewDPOptimizer(amount)
	split := usecase.NewFindOptimalSplit(opt, amount)
	search := usecase.NewSearchOptimalSplit(g, split, bypassRules)

	// 2. テストケースの実行
	tests := []struct {
		name    string
		from    string
		to      string
		months  int
		want    int
		wantErr bool
	}{
		{
			name:   "大宮〜東京 (通常の分割検討)",
			from:   "大宮",
			to:     "東京",
			months: 1,
			want:   17970,
		},
		{
			name:   "日暮里〜赤羽 (通しが最安)",
			from:   "日暮里",
			to:     "赤羽",
			months: 1,
			want:   6240,
		},
		{
			name:   "横浜〜新宿 (長距離の分割検討)",
			from:   "横浜",
			to:     "新宿",
			months: 3,
			want:   52200,
		},
		{
			name:   "函館〜東森 (第69条の考慮　片側のみ)",
			from:   "函館",
			to:     "東森",
			months: 6,
			want:   226080,
		},
		{
			name:   "新川崎〜大井町 (第69条の考慮　特例区間内完結)",
			from:   "新川崎",
			to:     "大井町",
			months: 3,
			want:   22340,
		},
		{
			name:    "東京〜東京 (同一駅、エラーケース)",
			from:    "東京",
			to:      "東京",
			months:  6,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fromID, ok1 := g.GetID(tt.from)
			toID, ok2 := g.GetID(tt.to)
			if !ok1 || !ok2 {
				t.Fatalf("駅が見つかりません: %s, %s", tt.from, tt.to)
			}

			results, err := search.Execute(fromID, toID, tt.months)
			if (err != nil) != tt.wantErr {
				t.Errorf("Execute() error = %v, wantErr %v", err, tt.wantErr)
				return
			}

			if err == nil {
				if len(results) == 0 {
					t.Error("結果が空です")
					return
				}

				if results[0].TotalAmount != tt.want {
					t.Errorf("Execute() TotalAmount = %d, want %d", results[0].TotalAmount, tt.want)
				}
			}
		})
	}
}
