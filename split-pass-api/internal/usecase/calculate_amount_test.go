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
		want    usecase.CalculationResult
		wantErr bool
	}{
		{
			name:   "複数会社跨ぎの計算（JR東日本+JR東海）＋加算運賃 + 加算料金",
			path:   []int{id("A"), id("B"), id("C")},
			months: 1,
			want: usecase.CalculationResult{
				Fare:           3100,
				BarrierFreeFee: 0,
				Charge:         100,
			},
			wantErr: false,
		},
		{
			name:   "電車特定区間の適用",
			path:   []int{id("X"), id("Y")},
			months: 1,
			want: usecase.CalculationResult{
				Fare:           500,
				BarrierFreeFee: 0,
				Charge:         0,
			},
			wantErr: false,
		},
		{
			name:   "電車特定区間と一般区間の混在（通常テーブルが適用されることの確認）",
			path:   []int{id("X"), id("Y"), id("A")},
			months: 1,
			want: usecase.CalculationResult{
				Fare:           1000,
				BarrierFreeFee: 0,
				Charge:         0,
			},
			wantErr: false,
		},
		{
			name:   "異常系: 駅が1つしかない",
			path:   []int{id("A")},
			months: 1,
			// 異常系は実行結果が nil になるため、want はゼロ値のままでOK
			wantErr: true,
		},
		{
			name:    "異常系: 存在しないエッジ",
			path:    []int{id("A"), id("X")},
			months:  1,
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
					t.Errorf("Execute() = nil, 期待値 %+v", tt.want)
					return
				}

				if *got != tt.want {
					t.Errorf("Execute() の内訳が一致しません。\ngot:  %+v\nwant: %+v", *got, tt.want)
				}

				// TotalAmountメソッド自体の計算ロジックも壊れていないか検証する
				if got.TotalAmount() != tt.want.TotalAmount() {
					t.Errorf("TotalAmount() = %v, 期待値 %v", got.TotalAmount(), tt.want.TotalAmount())
				}
			}
		})
	}
}
