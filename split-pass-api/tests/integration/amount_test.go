package integration_test

import (
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/graph/data"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/infra/graphio"
	"split-pass-api/internal/usecase"
	"testing"
)

// setup はテスト用に本番データを含むユースケースを初期化します。
func setup(t *testing.T) (*usecase.CalculateAmount, *graph.Graph) {
	t.Helper()

	// 1. グラフのロード
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("データのロードに失敗しました: %v", err)
	}

	// 2. 運賃計算レジストリの初期化
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("運賃計算レジストリの初期化に失敗しました: %v", err)
	}

	// 3. 加算運賃の登録（本番の main.go と同様の設定）
	addonFareReg := domain.NewAddonRegistry()
	addonFareReg.Register("南千歳", "新千歳空港", domain.PassPrice{OneMonth: 660, ThreeMonth: 1880, SixMonth: 3180})
	addonFareReg.Register("日根野", "りんくうタウン", domain.PassPrice{OneMonth: 4690, ThreeMonth: 13320, SixMonth: 22440})
	addonFareReg.Register("日根野", "関西空港", domain.PassPrice{OneMonth: 6640, ThreeMonth: 18900, SixMonth: 31820})
	addonFareReg.Register("りんくうタウン", "関西空港", domain.PassPrice{OneMonth: 5010, ThreeMonth: 14250, SixMonth: 24000})
	addonFareReg.Register("児島", "宇多津", domain.PassPrice{OneMonth: 1610, ThreeMonth: 4600, SixMonth: 8170})
	addonFareReg.Register("田吉", "宮崎空港", domain.PassPrice{OneMonth: 3840, ThreeMonth: 10960, SixMonth: 18680})

	// 4. 加算料金の登録
	addonChargeReg := domain.NewAddonRegistry()
	addonChargeReg.Register("博多", "博多南", domain.PassPrice{OneMonth: 4680, ThreeMonth: 13340, SixMonth: 25270})

	// 5. ID解決
	if err := addonFareReg.ResolveIDs(func(name string) (int, bool) {
		id, ok := g.NameToID[name]
		return id, ok
	}); err != nil {
		t.Fatalf("加算運賃のID解決に失敗しました: %v", err)
	}

	if err := addonChargeReg.ResolveIDs(func(name string) (int, bool) {
		id, ok := g.NameToID[name]
		return id, ok
	}); err != nil {
		t.Fatalf("加算料金のID解決に失敗しました: %v", err)
	}

	u := usecase.NewCalculateAmount(
		g,
		calcs.Registry,
		addonFareReg,
		addonChargeReg,
		calcs.TrainSpecific,
		calcs.SpecificRoute,
		calcs.AdjustedRoute,
	)
	return u, g
}

func TestAmountCalculation_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("統合テストをスキップします")
	}

	u, g := setup(t)

	// 駅名からIDを取得するヘルパー
	getIDs := func(names ...string) []int {
		ids := make([]int, len(names))
		for i, name := range names {
			id, ok := g.NameToID[name]
			if !ok {
				t.Fatalf("駅名が見つかりません: %s", name)
			}
			ids[i] = id
		}
		return ids
	}

	tests := []struct {
		name    string
		path    []int
		months  int
		want    usecase.CalculationResult
		wantErr bool
	}{
		{
			name:   "東京〜新宿（中央線経由）",
			path:   getIDs("東京", "神田", "御茶ノ水", "水道橋", "飯田橋", "市ケ谷", "四ツ谷", "信濃町", "千駄ケ谷", "代々木", "新宿"),
			months: 1,
			want: usecase.CalculationResult{
				// 営業キロ 10.3km -> 11km (電車特定区間運賃)
				Fare:           7840, // 運賃
				BarrierFreeFee: 0,
				Charge:         0,
			},
		},
		{
			name:   "大阪〜新大阪（営業キロ基準）",
			path:   getIDs("大阪", "新大阪"),
			months: 1,
			want: usecase.CalculationResult{
				// 営業キロ 3.8km -> 4km
				Fare:           5020,
				BarrierFreeFee: 300, // 電車特定区間はバリアフリー料金対象
				Charge:         0,
			},
		},
		{
			name:   "南千歳〜新千歳空港（加算運賃の適用）",
			path:   getIDs("南千歳", "新千歳空港"),
			months: 1,
			want: usecase.CalculationResult{
				// 加算運賃 660 + JR北海道幹線 3km(7690)
				Fare:           8350,
				BarrierFreeFee: 0,
				Charge:         0,
			},
		},
		{
			name:   "東京〜品川（東海道線）",
			path:   getIDs("東京", "有楽町", "新橋", "浜松町", "田町", "高輪ゲートウェイ", "品川"),
			months: 1,
			want: usecase.CalculationResult{
				// 営業キロ 6.8km -> 7km
				Fare:           6240,
				BarrierFreeFee: 0,
				Charge:         0,
			},
		},
		{
			name:   "日根野〜関西空港（加算運賃の重複適用防止の検証）",
			path:   getIDs("日根野", "りんくうタウン", "関西空港"),
			months: 1,
			want: usecase.CalculationResult{
				// 電車特定区間 12km (6990) + 日根野-関空加算 (6640)
				Fare:           13330,
				BarrierFreeFee: 300,
				Charge:         0,
			},
		},
		{
			name:   "博多南～南福岡（特急料金の適用検証）",
			path:   getIDs("博多南", "博多", "竹下", "笹原", "南福岡"),
			months: 6,
			want: usecase.CalculationResult{
				// 15.2 -> 16km 運賃 6か月(47520 + (45650 - 28520)) + 特急料金 6か月 (25270)
				Fare:           64650,
				BarrierFreeFee: 0,
				Charge:         25270,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := u.Execute(tt.path, tt.months)
			if (err != nil) != tt.wantErr {
				t.Errorf("Execute() エラー = %v, 期待されるエラー発生 = %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr {
				if got == nil {
					t.Errorf("Execute() = nil, 期待値 %v", tt.want)
					return
				}
				if *got != tt.want {
					t.Errorf("Execute() = %v, 期待値 %v", *got, tt.want)
				}
			}
		})
	}
}
