package integration_test

import (
	"calculation-engine/internal/graphdata"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/fareio"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
	"testing"
)

// setupTicketAmount は乗車券用の運賃計算ユースケースを初期化します
func setupTicketAmount(t *testing.T) (*usecase.CalculateAmount, graph.Graph) {
	t.Helper()

	// 1. グラフのロード（edges.json と virtual_edges.json の両方をロード）
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(
		graphdata.GetEdgesReader(),
		graphdata.GetVirtualEdgesReader(),
	)
	if err != nil {
		t.Fatalf("グラフデータのロードに失敗しました: %v", err)
	}

	// 2. 運賃計算レジストリ（各社）
	reg := fare.NewRegistry()

	// 3. 特定区間運賃・調整運賃のロード
	fareioReg, err := fareio.NewRegistry()
	if err != nil {
		t.Fatalf("fareioのロードに失敗しました: %v", err)
	}

	specificMatcher := fare.NewPathMatcher()
	for _, f := range fareioReg.GetSpecificFares() {
		ids := make([]int, len(f.Path))
		for i, name := range f.Path {
			id, ok := g.GetID(name)
			if !ok {
				// 本番のテストでは無視するかエラーにするが、ここでは無視
				continue
			}
			ids[i] = id
		}
		_ = specificMatcher.Insert(ids, f.Fare)
	}

	adjustedMatcher := fare.NewPathMatcher()
	for _, f := range fareioReg.GetAdjustedFares() {
		ids := make([]int, len(f.Path))
		for i, name := range f.Path {
			id, ok := g.GetID(name)
			if !ok {
				continue
			}
			ids[i] = id
		}
		_ = adjustedMatcher.Insert(ids, f.Fare)
	}

	// 4. 電車特定区間計算
	trainSpecificCalc := fare.NewTrainSpecificSectionCalculator()

	// 5. CalculateAmount ユースケースの作成
	calc := usecase.NewCalculateAmount(
		reg,
		trainSpecificCalc,
		specificMatcher,
		adjustedMatcher,
		g,
	)

	return calc, g
}

func TestTicketAmountCalculation_Integration(t *testing.T) {
	if testing.Short() {
		t.Skip("統合テストをスキップします")
	}

	u, g := setupTicketAmount(t)

	// 駅名からIDを取得するヘルパー
	getIDs := func(names ...string) []int {
		ids := make([]int, len(names))
		for i, name := range names {
			id, ok := g.GetID(name)
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
		want    usecase.CalculationResult
		wantErr bool
	}{
		{
			name: "東京〜新宿（中央線経由・幹線）",
			path: getIDs("東京", "神田", "御茶ノ水", "水道橋", "飯田橋", "市ケ谷", "四ツ谷", "信濃町", "千駄ケ谷", "代々木", "新宿"),
			want: usecase.CalculationResult{
				Fare:           260,
				BarrierFreeFee: 0,
				TotalEigyoKilo: 103,
			},
		},
		{
			name: "大阪〜新大阪（電車特定区間）",
			path: getIDs("大阪", "新大阪"),
			want: usecase.CalculationResult{
				Fare:           170,
				BarrierFreeFee: 10,
				TotalEigyoKilo: 38,
			},
		},
		{
			name: "東京〜西船橋（総武快速・緩行線経由：特定区間運賃の適用検証）",
			path: getIDs("東京", "新日本橋", "馬喰町", "錦糸町", "亀戸", "平井", "新小岩", "小岩", "市川", "本八幡", "下総中山", "西船橋"),
			want: usecase.CalculationResult{
				Fare:           350,
				BarrierFreeFee: 0,
				TotalEigyoKilo: 206,
			},
		},
		{
			name: "東京〜宇都宮",
			path: getIDs("東京山手線内", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮", "土呂", "東大宮", "蓮田", "白岡", "新白岡", "久喜", "東鷲宮", "栗橋", "古河", "野木", "間々田", "小山", "小金井", "自治医大", "石橋", "雀宮", "宇都宮"),
			want: usecase.CalculationResult{
				Fare:           2090,
				BarrierFreeFee: 0,
				TotalEigyoKilo: 1095,
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := u.Execute(tt.path)
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
					t.Errorf("Execute() = %+v, 期待値 %+v", *got, tt.want)
				}
			}
		})
	}
}
