package usecase_test

import (
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/usecase"
	"testing"
)

func TestCalculateAmountUseCase_Execute(t *testing.T) {
	g := graph.NewGraph(20)

	// 駅IDの取得を容易にするためのヘルパー
	id := func(name string) int { return g.GetOrAddID(name) }

	// 1. 東日本区間 (10.0km)
	g.AddEdge(domain.Edge{
		FromID: id("A"), ToID: id("B"),
		EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast,
	})
	// 2. 東海区間 (20.0km) + 加算運賃設定
	g.AddEdge(domain.Edge{
		FromID: id("B"), ToID: id("C"),
		EigyoKilo: 200, GiseiKilo: 200, IsLocal: false, Company: domain.JRCentral,
	})
	// 3. 電車特定区間 (5.0km)
	g.AddEdge(domain.Edge{
		FromID: id("X"), ToID: id("Y"),
		EigyoKilo: 50, GiseiKilo: 50, IsLocal: false, Company: domain.JREast,
		IsTrainSpecificSection: true,
	})
	// 4. 一般区間 (5.0km)
	g.AddEdge(domain.Edge{
		FromID: id("Y"), ToID: id("A"),
		EigyoKilo: 50, GiseiKilo: 50, IsLocal: false, Company: domain.JREast,
		IsTrainSpecificSection: false,
	})

	// ユニットテストでは InitRegistry を使わず、必要な計算機のみを手動で登録する
	reg := fare.NewRegistry()

	// ダミーの運賃テーブル（すべてのキロ数で定額を返すような単純なもの）
	var dummyTable [101]domain.PassPrice
	for i := range dummyTable {
		dummyTable[i] = domain.PassPrice{OneMonth: i * 100}
	}

	eastCalc := fare.NewEastCalculator(dummyTable, dummyTable)
	stdCalc := fare.NewStandardCalculator(dummyTable, dummyTable)
	trainSpecificCalc := fare.NewTrainSpecificSectionCalculator(dummyTable)

	reg.Register(domain.JREast, eastCalc)
	reg.Register(domain.JRCentral, stdCalc)

	addonFareReg := domain.NewAddonRegistry()
	// 加算運賃：B-C間に100円加算
	addonFareReg.Register("B", "C", domain.PassPrice{OneMonth: 100, ThreeMonth: 300, SixMonth: 600})
	_ = addonFareReg.ResolveIDs(func(name string) (int, bool) {
		id, ok := g.NameToID[name]
		return id, ok
	})

	addonChargeReg := domain.NewAddonRegistry()
	// 特急料金：B-C間に100円加算
	addonChargeReg.Register("B", "C", domain.PassPrice{OneMonth: 100, ThreeMonth: 300, SixMonth: 600})
	_ = addonChargeReg.ResolveIDs(func(name string) (int, bool) {
		id, ok := g.NameToID[name]
		return id, ok
	})

	u := usecase.NewCalculateAmountUseCase(
		g,
		reg,
		addonFareReg,
		addonChargeReg,
		trainSpecificCalc,
		fare.NewRouteMatcher(),
		fare.NewRouteMatcher(),
	)

	tests := []struct {
		name    string
		path    []int
		months  int
		want    int
		wantErr bool
	}{
		{
			name:   "複数会社跨ぎの計算（JR東日本+JR東海）＋加算運賃 + 加算料金",
			path:   []int{id("A"), id("B"), id("C")},
			months: 1,
			want: func() int {
				// JR合算運賃ルール: 全体(30km)の基準運賃 + (特定会社運賃 - 基準運賃) + 加算運賃 + 加算料金
				// base30 = 30*100 = 3000
				// east10 = 10*100 = 1000
				// base10 = 10*100 = 1000
				// total = 3000 + (1000 - 1000) + 100 + 100 = 3200
				return 3200
			}(),
			wantErr: false,
		},
		{
			name:   "電車特定区間の適用",
			path:   []int{id("X"), id("Y")},
			months: 1,
			want: func() int {
				// 電車特定区間テーブル 5km -> 500
				return 500
			}(),
			wantErr: false,
		},
		{
			name:   "電車特定区間と一般区間の混在（通常テーブルが適用されることの確認）",
			path:   []int{id("X"), id("Y"), id("A")},
			months: 1,
			want: func() int {
				// X-Y: 5.0km, Y-A: 5.0km -> 合計 10.0km (東日本)
				// 10km -> 1000
				return 1000
			}(),
			wantErr: false,
		},
		{
			name:    "異常系: 駅が1つしかない",
			path:    []int{id("A")},
			months:  1,
			want:    0,
			wantErr: true,
		},
		{
			name:    "異常系: 存在しないエッジ",
			path:    []int{id("A"), id("X")},
			months:  1,
			want:    0,
			wantErr: true,
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
				if got.TotalAmount() != tt.want {
					t.Errorf("Execute() = %v, 期待値 %v", got.TotalAmount(), tt.want)
				}
			}
		})
	}
}
