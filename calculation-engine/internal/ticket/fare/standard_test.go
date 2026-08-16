package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"testing"
)

func TestCalculateStandardFare(t *testing.T) {
	tests := []struct {
		name    string
		params  ticketdomain.TicketFareParams
		want    int
		wantErr bool
	}{
		{
			name: "幹線のみ 3km (切り上げ)",
			params: ticketdomain.TicketFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(21), // 2.1km -> 3km
			},
			want:    150,
			wantErr: false,
		},
		{
			name: "幹線のみ 6km",
			params: ticketdomain.TicketFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(55), // 5.5km -> 6km
			},
			want:    190,
			wantErr: false,
		},
		{
			name: "幹線のみ 10km",
			params: ticketdomain.TicketFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(95), // 9.5km -> 10km
			},
			want:    200,
			wantErr: false,
		},
		{
			name: "地方交通線のみ 7km",
			params: ticketdomain.TicketFareParams{
				RouteType: domain.RouteTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(65), // 6.5km -> 7km
			},
			want:    210, // 地方交通線の7km
			wantErr: false,
		},
		{
			name: "幹線・地方交通線混在 10km以下 (地方交通線運賃が適用される)",
			params: ticketdomain.TicketFareParams{
				RouteType: domain.RouteTypeMixed,
				EigyoKilo: domain.DeciKilo(81), // 8.1km -> 9km (10km以下)
				GiseiKilo: domain.DeciKilo(95), // 擬制キロ
			},
			want:    210, // 地方交通線の9kmは210
			wantErr: false,
		},
		{
			name: "幹線のみ 11km",
			params: ticketdomain.TicketFareParams{
				RouteType: domain.RouteTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(101), // 10.1km -> 11km
			},
			want:    240,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CalculateStandardFare(tt.params)
			if (err != nil) != tt.wantErr {
				t.Errorf("CalculateStandardFare() err = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("CalculateStandardFare() = %v, want %v", got, tt.want)
			}
		})
	}
}
