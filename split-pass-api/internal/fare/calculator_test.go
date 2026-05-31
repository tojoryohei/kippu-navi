package fare_test

import (
	"errors"
	"testing"

	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph/data"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/infra/graphio"
)

// ────────────────────────────────────────────────────────────
// Registry
// ────────────────────────────────────────────────────────────

func TestInitRegistry(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフデータの読み込みに失敗しました: %v", err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("InitRegistry()の初期化に失敗しました: %v", err)
	}
	reg := calcs.Registry

	// 全社分が取得できること
	companies := []domain.CompanyID{
		domain.JREast, domain.JRHokkaido, domain.JRCentral,
		domain.JRWest, domain.JRShikoku, domain.JRKyushu,
	}
	for _, id := range companies {
		if _, err := reg.Get(id); err != nil {
			t.Errorf("Get(%v)の取得に失敗しました: %v", id, err)
		}
	}

	// 未登録の会社IDはエラーになること
	_, err = reg.Get(domain.Other)
	if !errors.Is(err, fare.ErrCalculatorNotFound) {
		t.Errorf("未登録IDで ErrCalculatorNotFound が返されませんでした: %v", err)
	}
}

// ────────────────────────────────────────────────────────────
// StandardCalculator
// ────────────────────────────────────────────────────────────

func TestStandardCalculator_Calculate(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフデータの読み込みに失敗しました: %v", err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("InitRegistryの初期化に失敗しました: %v", err)
	}
	reg := calcs.Registry
	calc, err := reg.Get(domain.JRCentral)
	if err != nil {
		t.Fatalf("StandardCalculatorの取得に失敗しました: %v", err)
	}

	tests := []calcTestCase{
		// ── 正常系：RouteType別 ──────────────────────────────
		{
			name: "幹線のみ 1ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(150),
				GiseiKilo: domain.DeciKilo(150),
				Months:    1,
			},
			wantFare: 7260,
		},
		{
			name: "地方交通線のみ 3ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(205),
				GiseiKilo: domain.DeciKilo(205),
				Months:    3,
			},
			wantFare: 35730,
		},
		{
			name: "幹線・地方混在 6ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeMixed,
				EigyoKilo: domain.DeciKilo(85),
				GiseiKilo: domain.DeciKilo(94),
				Months:    6,
			},
			wantFare: 30100,
		},
		// ── 境界値：RouteTypeMixed の10km特例 ────────────────
		// 旅客営業規則第86条：営業キロが10km以下なら地方交通線運賃表を適用
		{
			name: "混在 営業キロちょうど10km → 地方交通線運賃表",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeMixed,
				EigyoKilo: domain.DeciKilo(100), // 10.0km → ceil = 10
				GiseiKilo: domain.DeciKilo(110),
				Months:    1,
			},
			// 地方交通線テーブルの10kmの1ヶ月運賃と一致すること
			wantFare: 6260,
		},
		{
			name: "混在 営業キロ11km → 幹線運賃表・擬制キロ使用",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeMixed,
				EigyoKilo: domain.DeciKilo(101), // 10.1km → ceil = 11
				GiseiKilo: domain.DeciKilo(111),
				Months:    3,
			},
			// 幹線テーブルの12km（GiseiKilo ceil）の1ヶ月運賃と一致すること
			wantFare: 20690,
		},
		// ── 境界値：100km折り返し ─────────────────────────────
		{
			name: "幹線のみ ちょうど100km 6ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(1000), // 100.0km → ceil = 100
				GiseiKilo: domain.DeciKilo(1000),
				Months:    6,
			},
			// table[100].SixMonth * 1 + table[0].SixMonth
			wantFare: 243940,
		},
		{
			name: "幹線のみ 101km 1ヶ月（折り返し境界を超える）",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(1001), // 100.1km → ceil = 101
				GiseiKilo: domain.DeciKilo(1001),
				Months:    6,
			},
			// table[100].SixMonth * 1 + table[1].SixMonth
			wantFare: 266100,
		},
		// ── エラー系 ─────────────────────────────────────────
		{
			name: "マイナスの距離",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(-10),
				GiseiKilo: domain.DeciKilo(-10),
				Months:    1,
			},
			wantErr:   true,
			wantErrIs: domain.ErrNegativeDistance,
		},
		{
			name: "不正な月数",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(100),
				GiseiKilo: domain.DeciKilo(100),
				Months:    4,
			},
			wantErr:   true,
			wantErrIs: domain.ErrInvalidMonths,
		},
		{
			name: "不正なRouteType",
			params: domain.PassFareParams{
				RouteType: domain.RouteType(99),
				EigyoKilo: domain.DeciKilo(100),
				GiseiKilo: domain.DeciKilo(100),
				Months:    1,
			},
			wantErr:   true,
			wantErrIs: fare.ErrInvalidRouteType,
		},
	}

	runCalculatorTests(t, calc, tests)
}

// ────────────────────────────────────────────────────────────
// HokkaidoCalculator
// ────────────────────────────────────────────────────────────

func TestHokkaidoCalculator_Calculate(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフデータの読み込みに失敗しました: %v", err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("InitRegistryの初期化に失敗しました: %v", err)
	}
	reg := calcs.Registry
	calc, err := reg.Get(domain.JRHokkaido)
	if err != nil {
		t.Fatalf("HokkaidoCalculatorの初期化に失敗しました: %v", err)
	}

	tests := []calcTestCase{
		{
			name: "幹線のみ 1ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(150),
				GiseiKilo: domain.DeciKilo(150),
				Months:    1,
			},
			wantFare: 12920,
		},
		{
			name: "地方交通線のみ 6ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(205),
				GiseiKilo: domain.DeciKilo(205),
				Months:    6,
			},
			wantFare: 108160,
		},
	}

	runCalculatorTests(t, calc, tests)
}

// ────────────────────────────────────────────────────────────
// EastCalculator
// ────────────────────────────────────────────────────────────

func TestEastCalculator_Calculate(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフデータの読み込みに失敗しました: %v", err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("InitRegistryの初期化に失敗しました: %v", err)
	}
	reg := calcs.Registry
	calc, err := reg.Get(domain.JREast)
	if err != nil {
		t.Fatalf("EastCalculatorの取得に失敗しました: %v", err)
	}

	tests := []calcTestCase{
		{
			name: "幹線のみ 1ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(150),
				GiseiKilo: domain.DeciKilo(150),
				Months:    1,
			},
			wantFare: 7840,
		},
		{
			name: "地方交通線のみ 3ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(205),
				GiseiKilo: domain.DeciKilo(205),
				Months:    3,
			},
			wantFare: 37380,
		},
	}

	runCalculatorTests(t, calc, tests)
}

// ────────────────────────────────────────────────────────────
// ShikokuCalculator
// ────────────────────────────────────────────────────────────

func TestShikokuCalculator_Calculate(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフデータの読み込みに失敗しました: %v", err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("InitRegistryの初期化に失敗しました: %v", err)
	}
	reg := calcs.Registry
	calc, err := reg.Get(domain.JRShikoku)
	if err != nil {
		t.Fatalf("ShikokuCalculatorの初期化に失敗しました: %v", err)
	}

	tests := []calcTestCase{
		// ── 正常系 ───────────────────────────────────────────
		// 四国は RouteType に関わらず常に GiseiKilo の単一テーブルを使用する
		{
			name: "1ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(104),
				GiseiKilo: domain.DeciKilo(104),
				Months:    1,
			},
			wantFare: 10260,
		},
		{
			name: "3ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeMixed,
				EigyoKilo: domain.DeciKilo(188),
				GiseiKilo: domain.DeciKilo(197),
				Months:    3,
			},
			wantFare: 38000,
		},
		{
			name: "6ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(778),
				GiseiKilo: domain.DeciKilo(856),
				Months:    6,
			},
			wantFare: 307100,
		},
		// RouteTypeが異なっても GiseiKilo を使うため結果は同じになる
		{
			name: "RouteTypeMixed でも GiseiKilo が使われること",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeMixed,
				EigyoKilo: domain.DeciKilo(188),
				GiseiKilo: domain.DeciKilo(197),
				Months:    1,
			},
			wantFare: 13360,
		},
		// ── エラー系 ─────────────────────────────────────────
		{
			name: "マイナスの距離",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(-10),
				GiseiKilo: domain.DeciKilo(-10),
				Months:    1,
			},
			wantErr:   true,
			wantErrIs: domain.ErrNegativeDistance,
		},
		{
			name: "不正な月数",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(28),
				GiseiKilo: domain.DeciKilo(31),
				Months:    5,
			},
			wantErr: true,
		},
	}

	runCalculatorTests(t, calc, tests)
}

// ────────────────────────────────────────────────────────────
// KyushuCalculator
// ────────────────────────────────────────────────────────────

func TestKyushuCalculator_Calculate(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフデータの読み込みに失敗しました: %v", err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("InitRegistryの初期化に失敗しました: %v", err)
	}
	reg := calcs.Registry
	calc, err := reg.Get(domain.JRKyushu)
	if err != nil {
		t.Fatalf("KyushuCalculatorの取得に失敗しました: %v", err)
	}

	tests := []calcTestCase{
		// ── 特殊運賃：全月数が定義されているケース ───────────
		{
			name: "特殊運賃 地方交通線 g=4,e=3 1ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(28), // ceil = 3
				GiseiKilo: domain.DeciKilo(31), // ceil = 4
				Months:    1,
			},
			wantFare: 7130,
		},
		{
			name: "特殊運賃 地方交通線 g=4,e=3 3ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(28),
				GiseiKilo: domain.DeciKilo(31),
				Months:    3,
			},
			wantFare: 20440,
		},
		{
			name: "特殊運賃 地方交通線 g=4,e=3 6ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(28),
				GiseiKilo: domain.DeciKilo(31),
				Months:    6,
			},
			wantFare: 36200,
		},
		// ── 特殊運賃：6ヶ月のみ定義・それ以外は通常テーブル ──
		{
			name: "特殊運賃 g=41,e=37 6ヶ月 → 特殊運賃",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(370), // ceil = 37
				GiseiKilo: domain.DeciKilo(407), // ceil = 41
				Months:    6,
			},
			wantFare: 157980,
		},
		{
			name: "特殊運賃 g=41,e=37 1ヶ月 → 通常テーブルへフォールバック",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(370),
				GiseiKilo: domain.DeciKilo(407),
				Months:    1,
			},
			// 通常テーブルの 41km 1ヶ月運賃
			wantFare: 30610,
		},
		{
			name: "特殊運賃 g=41,e=37 3ヶ月 → 通常テーブルへフォールバック",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(370),
				GiseiKilo: domain.DeciKilo(407),
				Months:    3,
			},
			// 通常テーブルの 41km 3ヶ月運賃
			wantFare: 88160,
		},
		{
			name: "特殊運賃 g=46,e=41 6ヶ月 → 特殊運賃",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(410), // ceil = 41
				GiseiKilo: domain.DeciKilo(451), // ceil = 46
				Months:    6,
			},
			wantFare: 179510,
		},
		{
			name: "特殊運賃 g=46,e=41 1ヶ月 → 通常テーブルへフォールバック",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(410),
				GiseiKilo: domain.DeciKilo(451),
				Months:    1,
			},
			// 通常テーブル의 46km 1ヶ月運賃
			wantFare: 32490,
		},
		// ── 特殊運賃：RouteTypeMixed ──────────────────────────
		{
			name: "特殊運賃 混在 g=4,e=3 1ヶ月",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeMixed,
				EigyoKilo: domain.DeciKilo(28),
				GiseiKilo: domain.DeciKilo(31),
				Months:    1,
			},
			wantFare: 7130,
		},
		// ── 通常テーブルへのフォールバック ───────────────────
		{
			name: "特殊運賃に該当しない距離は通常テーブルを使用",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeMixed,
				EigyoKilo: domain.DeciKilo(22), // ceil = 3
				GiseiKilo: domain.DeciKilo(24), // ceil = 3
				Months:    1,
			},
			// 通常テーブルの 3km 1ヶ月運賃
			wantFare: 6690,
		},
		// ── エラー系 ─────────────────────────────────────────
		{
			name: "マイナスの距離",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(-10),
				GiseiKilo: domain.DeciKilo(-10),
				Months:    1,
			},
			wantErr:   true,
			wantErrIs: domain.ErrNegativeDistance,
		},
		{
			name: "不正な月数",
			params: domain.PassFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(28),
				GiseiKilo: domain.DeciKilo(31),
				Months:    5,
			},
			wantErr: true,
		},
	}

	runCalculatorTests(t, calc, tests)
}

// ────────────────────────────────────────────────────────────
// ヘルパー
// ────────────────────────────────────────────────────────────

type calculator interface {
	Calculate(params domain.PassFareParams) (int, error)
}

type calcTestCase struct {
	name      string
	params    domain.PassFareParams
	wantFare  int
	wantErr   bool
	wantErrIs error
}

func runCalculatorTests(t *testing.T, calc calculator, tests []calcTestCase) {
	t.Helper()
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotFare, err := calc.Calculate(tt.params)
			if tt.wantErr {
				if err == nil {
					t.Errorf("エラーが期待されましたが、nilが返されました")
					return
				}
				if tt.wantErrIs != nil && !errors.Is(err, tt.wantErrIs) {
					t.Errorf("エラーの種類が異なります: got %v, want %v", err, tt.wantErrIs)
				}
				return
			}
			if err != nil {
				t.Errorf("予期しないエラー: %v", err)
				return
			}
			if gotFare != tt.wantFare {
				t.Errorf("Calculate() = %v, 期待値 %v", gotFare, tt.wantFare)
			}
		})
	}
}
