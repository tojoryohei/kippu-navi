package fare_test

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/fare"
	"testing"
)

func TestCalculateJointFare(t *testing.T) {
	// レジストリの初期化
	r := fare.NewRegistry()

	tests := []struct {
		name           string
		totalEigyo     domain.DeciKilo
		totalGisei     domain.DeciKilo
		totalRouteType domain.RouteType
		components     []fare.JointFareComponent
		want           int
		wantErr        bool
	}{
		{
			name:           "本州内（東海・西日本）またがり: 加算なし",
			totalEigyo:     domain.DeciKilo(505), // 50.5km -> 51km
			totalGisei:     domain.DeciKilo(505),
			totalRouteType: domain.RouteTypeTrunkOnly,
			components: []fare.JointFareComponent{
				{CompanyID: domain.JRCentral, RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: domain.DeciKilo(200), GiseiKilo: domain.DeciKilo(200)},
				{CompanyID: domain.JRWest, RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: domain.DeciKilo(305), GiseiKilo: domain.DeciKilo(305)},
			},
			want:    990, // 51km〜60kmの幹線運賃は990円
			wantErr: false,
		},
		{
			name:           "東日本またがり（加算あり）",
			totalEigyo:     domain.DeciKilo(2005), // 200.5km -> 201km
			totalGisei:     domain.DeciKilo(2005),
			totalRouteType: domain.RouteTypeTrunkOnly,
			components: []fare.JointFareComponent{
				{CompanyID: domain.JRCentral, RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: domain.DeciKilo(1000), GiseiKilo: domain.DeciKilo(1000)},
				{CompanyID: domain.JREast, RouteType: domain.RouteTypeTrunkOnly, EigyoKilo: domain.DeciKilo(1005), GiseiKilo: domain.DeciKilo(1005)}, // 東日本部分 101km
			},
			// 基準運賃（本州2社）201km = 3740円
			// 東日本分（101km） = 東日本2090円 - 本州2社1980円 = 110円
			// 合計 3740 + 110 = 3850円
			want:    3850,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := fare.CalculateJointFare(r, tt.totalEigyo, tt.totalGisei, tt.totalRouteType, tt.components)
			if (err != nil) != tt.wantErr {
				t.Errorf("CalculateJointFare() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("CalculateJointFare() = %v, want %v", got, tt.want)
			}
		})
	}
}
