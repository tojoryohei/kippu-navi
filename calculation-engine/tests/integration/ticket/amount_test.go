package ticket_test

import (
	"io"
	"testing"

	"calculation-engine/internal/graphdata"
	"calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/fareio"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
)

// setupTicketAmount は乗車券用の運賃計算ユースケースを初期化します
func setupTicketAmount(t *testing.T) (*usecase.CalculateAmount, graph.Graph) {
	t.Helper()

	// 1. グラフのロード（edges.json と virtual_edges.json の両方をロード）
	loader := &graphio.JSONLoader{}
	_, g, err := loader.LoadSeparatedGraphs(
		[]io.Reader{graphdata.GetEdgesReader()},
		[]io.Reader{graphdata.GetVirtualEdgesReader()},
	)
	if err != nil {
		t.Fatalf("グラフデータのロードに失敗しました: %v", err)
	}

	// 2. 特例（特定都区市内）のレジストリ
	zoneReg, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatalf("特例ゾーンのロードに失敗しました: %v", err)
	}

	for _, z := range zoneReg.Zones {
		g.GetOrAddID(z.Name)
	}

	// 2.5 運賃計算レジストリ（各社）
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

	// 4. 加算運賃の登録
	addonReg := fare.NewAddonRegistry()
	addonReg.Register("南千歳", "新千歳空港", 20)
	addonReg.Register("日根野", "りんくうタウン", 150)
	addonReg.Register("りんくうタウン", "関西空港", 170)
	addonReg.Register("日根野", "関西空港", 220)
	addonReg.Register("児島", "宇多津", 110)
	addonReg.Register("田吉", "宮崎空港", 130)
	_ = addonReg.ResolveIDs(func(name string) (int, bool) {
		return g.GetID(name)
	})

	// 5. 電車特定区間計算
	trainSpecificCalc := fare.NewTrainSpecificSectionCalculator()

	zrBytes, err := io.ReadAll(graphdata.GetZoneRoutesReader())
	if err != nil {
		t.Fatalf("zoneRoutesの読み込みに失敗しました: %v", err)
	}
	zoneRoutes, err := domain.LoadZoneRoutesFromBytes(zrBytes)
	if err != nil {
		t.Fatalf("zoneRoutesのパースに失敗しました: %v", err)
	}

	arBytes, err := io.ReadAll(graphdata.GetArticle70RoutesReader())
	if err != nil {
		t.Fatalf("article70Routesの読み込みに失敗しました: %v", err)
	}
	article70Routes, err := domain.LoadArticle70RoutesFromBytes(arBytes)
	if err != nil {
		t.Fatalf("article70Routesのパースに失敗しました: %v", err)
	}

	privateReg, err := fareio.NewPrivateFareRegistry()
	if err != nil {
		t.Fatalf("PrivateFareRegistryの初期化に失敗しました: %v", err)
	}

	// 6. CalculateAmount ユースケースの作成
	calc := usecase.NewCalculateAmount(
		reg,
		addonReg,
		trainSpecificCalc,
		specificMatcher,
		adjustedMatcher,
		privateReg,
		g,
		zoneRoutes,
		article70Routes,
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
			name: "東京〜西船橋（特定区間運賃の適用検証）",
			path: getIDs("東京", "新日本橋", "馬喰町", "錦糸町", "亀戸", "平井", "新小岩", "小岩", "市川", "本八幡", "下総中山", "西船橋"),
			want: usecase.CalculationResult{
				Fare:           350,
				BarrierFreeFee: 0,
				TotalEigyoKilo: 206,
			},
		},
		{
			name: "東京〜宇都宮",
			path: getIDs("東京山手線内", "田端", "上中里", "王子", "東十条", "赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮", "土呂", "東大宮", "蓮田", "白岡", "新白岡", "久喜", "東鷲宮", "栗橋", "古河", "野木", "間々田", "小山", "小金井", "自治医大", "石橋", "雀宮", "宇都宮"),
			want: usecase.CalculationResult{
				Fare:           2090,
				BarrierFreeFee: 0,
				TotalEigyoKilo: 1095,
			},
		},
		{
			name: "南千歳〜新千歳空港（加算運賃の適用）",
			path: getIDs("南千歳", "新千歳空港"),
			want: usecase.CalculationResult{
				Fare:           230, // 基本210 + 加算20
				BarrierFreeFee: 0,
				TotalEigyoKilo: 26,
			},
		},
		{
			name: "日根野〜関西空港（加算運賃の重複適用防止の検証）",
			path: getIDs("日根野", "りんくうタウン", "関西空港"),
			want: usecase.CalculationResult{
				Fare:           450, // 基本230 + 加算220
				BarrierFreeFee: 10,
				TotalEigyoKilo: 111,
			},
		},
		{
			name: "日根野〜りんくうタウン（加算運賃の重複適用防止の検証）",
			path: getIDs("日根野", "りんくうタウン"),
			want: usecase.CalculationResult{
				Fare:           320, // 基本160 + 加算160
				BarrierFreeFee: 10,
				TotalEigyoKilo: 42,
			},
		},
		{
			name: "りんくうタウン〜関西空港（加算運賃の重複適用防止の検証）",
			path: getIDs("りんくうタウン", "関西空港"),
			want: usecase.CalculationResult{
				Fare:           360, // 基本190 + 加算170
				BarrierFreeFee: 10,
				TotalEigyoKilo: 69,
			},
		},
		{
			name: "田吉〜宮崎空港（加算運賃の適用）",
			path: getIDs("宮崎", "南宮崎", "田吉", "宮崎空港"),
			want: usecase.CalculationResult{
				Fare:           400, // 基本270 + 加算130
				BarrierFreeFee: 0,
				TotalEigyoKilo: 60,
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
				if got.Fare != tt.want.Fare || got.BarrierFreeFee != tt.want.BarrierFreeFee || got.TotalEigyoKilo != tt.want.TotalEigyoKilo {
					t.Errorf("Execute() = %+v, 期待値 %+v", *got, tt.want)
				}
			}
		})
	}
}
