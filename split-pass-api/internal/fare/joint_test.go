package fare_test

import (
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/infra/graphio"
	"testing"
)

func TestCalculateJointFare(t *testing.T) {
	// 実データのレジストリを使用
	loader := &graphio.JSONLoader{}
	g, err := loader.Load("../graph/data/edges.json")
	if err != nil {
		t.Fatalf("グラフのロードに失敗しました: %v", err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("レジストリの初期化に失敗しました: %v", err)
	}
	reg := calcs.Registry

	// 期待値計算用の各社単体計算機
	standardCalc, _ := reg.Get(domain.JRCentral)
	eastCalc, _ := reg.Get(domain.JREast)

	tests := []struct {
		name           string
		totalEigyo     domain.DeciKilo
		totalGisei     domain.DeciKilo
		totalRouteType domain.RouteType
		components     []fare.JointFareComponent
		months         int
		want           int
		wantErr        bool
	}{
		{
			name:           "単一会社（JR東海）のみの場合",
			totalEigyo:     100, // 10km
			totalGisei:     100,
			totalRouteType: domain.RouteTypeTrunkOnly,
			components: []fare.JointFareComponent{
				{CompanyID: domain.JRCentral, RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 100, GiseiKilo: 100},
			},
			months: 1,
			want: func() int {
				// 10kmの基準額(1ヶ月) 5940
				standard10_1, _ := standardCalc.Calculate(domain.PassFareParams{RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 100, GiseiKilo: 100, Months: 1})
				return standard10_1
			}(),
		},
		{
			name:           "複数会社（東日本 + 東海）の合算計算（6ヶ月運賃）",
			totalEigyo:     368, // 合計 37km
			totalGisei:     368,
			totalRouteType: domain.RouteTypeTrunkOnly,
			components: []fare.JointFareComponent{
				{CompanyID: domain.JREast, RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 207, GiseiKilo: 207},
				{CompanyID: domain.JRCentral, RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 161, GiseiKilo: 161},
			},
			months: 6,
			want: func() int {
				// 37kmの基準額(6ヶ月) 98220 + 東日本21kmの加算額(6ヶ月) 6790
				standard37_6, _ := standardCalc.Calculate(domain.PassFareParams{RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 368, GiseiKilo: 368, Months: 6})
				east21_6, _ := eastCalc.Calculate(domain.PassFareParams{RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 207, GiseiKilo: 207, Months: 6})
				standard21_6, _ := standardCalc.Calculate(domain.PassFareParams{RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 207, GiseiKilo: 207, Months: 6})
				return standard37_6 + (east21_6 - standard21_6)
			}(),
		},
		{
			name:           "3社跨ぎ（西日本 + 東日本 + 東海）の複雑な合算",
			totalEigyo:     916, // 合計 92km
			totalGisei:     990, // 合計 99km
			totalRouteType: domain.RouteTypeMixed,
			components: []fare.JointFareComponent{
				{CompanyID: domain.JRWest, RouteType: domain.RouteTypeLocalOnly, EigyoKilo: 40, GiseiKilo: 44},
				{CompanyID: domain.JREast, RouteType: domain.RouteTypeMixed, EigyoKilo: 834, GiseiKilo: 904},
				{CompanyID: domain.JRCentral, RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 42, GiseiKilo: 42},
			},
			months: 3,
			want: func() int {
				// 99kmの基準額(3ヶ月) 133970 + 東日本91kmの加算額(3ヶ月) 7320
				standard99_3, _ := standardCalc.Calculate(domain.PassFareParams{RouteType: domain.RouteTypeMixed, EigyoKilo: 916, GiseiKilo: 990, Months: 3})
				east91_3, _ := eastCalc.Calculate(domain.PassFareParams{RouteType: domain.RouteTypeMixed, EigyoKilo: 834, GiseiKilo: 904, Months: 3})
				standard91_3, _ := standardCalc.Calculate(domain.PassFareParams{RouteType: domain.RouteTypeMixed, EigyoKilo: 834, GiseiKilo: 904, Months: 3})
				return standard99_3 + (east91_3 - standard91_3)
			}(),
		},
		{
			name:           "異常系: レジストリに存在しない会社ID",
			totalEigyo:     100,
			totalGisei:     100,
			totalRouteType: domain.RouteTypeTrunkOnly,
			components: []fare.JointFareComponent{
				{CompanyID: domain.CompanyID(99), RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: 100, GiseiKilo: 100},
			},
			months:  1,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := fare.CalculateJointFare(reg, tt.totalEigyo, tt.totalGisei, tt.totalRouteType, tt.components, tt.months)
			if (err != nil) != tt.wantErr {
				t.Errorf("CalculateJointFare() エラー = %v, 期待されるエラー発生 = %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && got != tt.want {
				t.Errorf("CalculateJointFare() = %v, 期待値 %v", got, tt.want)
			}
		})
	}
}
