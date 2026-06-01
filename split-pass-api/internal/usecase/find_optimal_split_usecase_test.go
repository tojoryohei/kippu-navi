package usecase_test

import (
	"reflect"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/usecase"
	"testing"
)

func TestFindOptimalSplitUseCase_Execute(t *testing.T) {
	g := graph.NewGraph(20)
	id := func(name string) int { return g.GetOrAddID(name) }

	// A - B - C のグラフを作成
	g.AddEdge(domain.Edge{
		FromID: id("A"), ToID: id("B"),
		EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast,
	})
	g.AddEdge(domain.Edge{
		FromID: id("B"), ToID: id("C"),
		EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast,
	})
	// もう1つ追加
	g.AddEdge(domain.Edge{
		FromID: id("C"), ToID: id("D"),
		EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast,
	})

	reg := fare.NewRegistry()

	// ダミーの運賃テーブル
	// A-B (10km): 1000円
	// B-C (10km): 1000円
	// C-D (10km): 1000円
	// A-C (20km): 2500円（分割した方が安い設定：1000+1000 = 2000円）
	// B-D (20km): 2500円（同上）
	// A-D (30km): 4000円
	var dummyTable [101]domain.PassPrice
	for i := range dummyTable {
		if i <= 10 {
			dummyTable[i] = domain.PassPrice{OneMonth: 1000} // 10kmまで
		} else if i <= 20 {
			dummyTable[i] = domain.PassPrice{OneMonth: 2500} // 20kmまで
		} else {
			dummyTable[i] = domain.PassPrice{OneMonth: 4000} // それ以上
		}
	}

	eastCalc := fare.NewEastCalculator(dummyTable, dummyTable)
	stdCalc := fare.NewStandardCalculator(dummyTable, dummyTable)
	reg.Register(domain.JREast, eastCalc)
	reg.Register(domain.JRCentral, stdCalc)

	addonFareReg := domain.NewAddonRegistry()
	addonChargeReg := domain.NewAddonRegistry()

	calcUseCase := usecase.NewCalculateAmountUseCase(
		g,
		reg,
		addonFareReg,
		addonChargeReg,
		fare.NewTrainSpecificSectionCalculator(dummyTable),
		fare.NewRouteMatcher(),
		fare.NewRouteMatcher(),
	)

	findOptimalUseCase := usecase.NewFindOptimalSplitUseCase(calcUseCase)

	tests := []struct {
		name    string
		path    []int
		months  int
		want    []usecase.SplitResult
		wantErr bool
	}{
		{
			name:   "分割した方が安いパターン (A-B-C)",
			path:   []int{id("A"), id("B"), id("C")},
			months: 1,
			want: []usecase.SplitResult{
				{
					TotalAmount: 2000,
					Segments: []usecase.SplitSegment{
						{
							Path:   []int{id("A"), id("B")},
							Result: &usecase.CalculationResult{Fare: 1000},
						},
						{
							Path:   []int{id("B"), id("C")},
							Result: &usecase.CalculationResult{Fare: 1000},
						},
					},
				},
			},
			wantErr: false,
		},
		{
			name:   "3駅区間で全通し・1分割・2分割を比較 (A-B-C-D) 最安はA-B, B-C, C-D の3分割",
			path:   []int{id("A"), id("B"), id("C"), id("D")},
			months: 1,
			want: []usecase.SplitResult{
				{
					TotalAmount: 3000, // A-B, B-C, C-D のそれぞれで1000円
					Segments: []usecase.SplitSegment{
						{
							Path:   []int{id("A"), id("B")},
							Result: &usecase.CalculationResult{Fare: 1000},
						},
						{
							Path:   []int{id("B"), id("C")},
							Result: &usecase.CalculationResult{Fare: 1000},
						},
						{
							Path:   []int{id("C"), id("D")},
							Result: &usecase.CalculationResult{Fare: 1000},
						},
					},
				},
			},
			wantErr: false,
		},
		{
			name:    "異常系：経路が1駅",
			path:    []int{id("A")},
			months:  1,
			want:    nil,
			wantErr: true,
		},
		{
			name:    "異常系：存在しない経路",
			path:    []int{id("A"), id("D")},
			months:  1,
			want:    nil,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := findOptimalUseCase.Execute(tt.path, tt.months)
			if (err != nil) != tt.wantErr {
				t.Errorf("Execute() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr {
				if len(got) != len(tt.want) {
					t.Fatalf("Execute() returned %v results, want %v", len(got), len(tt.want))
				}
				for i := range got {
					if got[i].TotalAmount != tt.want[i].TotalAmount {
						t.Errorf("Execute()[%d] TotalAmount = %v, want %v", i, got[i].TotalAmount, tt.want[i].TotalAmount)
					}
					if len(got[i].Segments) != len(tt.want[i].Segments) {
						t.Fatalf("Execute()[%d] Segments count = %v, want %v", i, len(got[i].Segments), len(tt.want[i].Segments))
					}
					for j := range got[i].Segments {
						if !reflect.DeepEqual(got[i].Segments[j].Path, tt.want[i].Segments[j].Path) {
							t.Errorf("Segments[%d][%d].Path = %v, want %v", i, j, got[i].Segments[j].Path, tt.want[i].Segments[j].Path)
						}
						if got[i].Segments[j].Result.Fare != tt.want[i].Segments[j].Result.Fare {
							t.Errorf("Segments[%d][%d].Result.Fare = %v, want %v", i, j, got[i].Segments[j].Result.Fare, tt.want[i].Segments[j].Result.Fare)
						}
					}
				}
			}
		})
	}
}

// 複数パターンの最安値が返ることを確認するテスト
func TestFindOptimalSplitUseCase_Execute_MultipleOptimalPaths(t *testing.T) {
	g := graph.NewGraph(20)
	id := func(name string) int { return g.GetOrAddID(name) }

	g.AddEdge(domain.Edge{
		FromID: id("A"), ToID: id("B"), EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast,
	})
	g.AddEdge(domain.Edge{
		FromID: id("B"), ToID: id("C"), EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast,
	})
	g.AddEdge(domain.Edge{
		FromID: id("C"), ToID: id("D"), EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast,
	})

	reg := fare.NewRegistry()

	// ダミー運賃:
	// 10km (1区間) = 1000円
	// 20km (2区間) = 2000円
	// 30km (3区間) = 3000円
	// -> この設定だと、「A-B-C-D」は
	// 1. 全通し: A-D (3000円)
	// 2. 1分割: A-B(1000), B-D(2000) -> 3000円
	// 3. 1分割: A-C(2000), C-D(1000) -> 3000円
	// 4. 2分割: A-B(1000), B-C(1000), C-D(1000) -> 3000円
	// すべてのパターンが3000円になり、4つの結果が返るはず
	var dummyTable [101]domain.PassPrice
	for i := range dummyTable {
		if i <= 10 {
			dummyTable[i] = domain.PassPrice{OneMonth: 1000}
		} else if i <= 20 {
			dummyTable[i] = domain.PassPrice{OneMonth: 2000}
		} else {
			dummyTable[i] = domain.PassPrice{OneMonth: 3000}
		}
	}

	eastCalc := fare.NewEastCalculator(dummyTable, dummyTable)
	stdCalc := fare.NewStandardCalculator(dummyTable, dummyTable)
	reg.Register(domain.JREast, eastCalc)
	reg.Register(domain.JRCentral, stdCalc)

	addonFareReg := domain.NewAddonRegistry()
	addonChargeReg := domain.NewAddonRegistry()

	calcUseCase := usecase.NewCalculateAmountUseCase(
		g, reg, addonFareReg, addonChargeReg,
		fare.NewTrainSpecificSectionCalculator(dummyTable),
		fare.NewRouteMatcher(), fare.NewRouteMatcher(),
	)

	findOptimalUseCase := usecase.NewFindOptimalSplitUseCase(calcUseCase)

	got, err := findOptimalUseCase.Execute([]int{id("A"), id("B"), id("C"), id("D")}, 1)
	if err != nil {
		t.Fatalf("Execute() unexpected error: %v", err)
	}

	if len(got) != 4 {
		t.Errorf("Expected 4 optimal paths, got %d", len(got))
	}
	for i, res := range got {
		if res.TotalAmount != 3000 {
			t.Errorf("Result %d total amount = %d, want 3000", i, res.TotalAmount)
		}
	}
}
