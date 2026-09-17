package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"testing"
)

func TestCalculateKyushuFare(t *testing.T) {
	tests := []struct {
		name    string
		params  ticketdomain.TicketFareParams
		want    int
		wantErr bool
	}{
		{
			name: "九州 10km以下 (擬制4km 営業3km)",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(25), // 2.5km -> 3km
				GiseiKilo: domain.DeciKilo(35), // 3.5km -> 4km
			},
			want:    210,
			wantErr: false,
		},
		{
			name: "九州 幹線のみ 11km",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(105), // 10.5km -> 11km
				GiseiKilo: domain.DeciKilo(105), // 10.5km -> 11km
			},
			want:    340,
			wantErr: false,
		},
		{
			name: "九州 地方交通線のみ 100km超 101km (擬制101km 営業91km)",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(905),  // 90.5km -> 91km
				GiseiKilo: domain.DeciKilo(1005), // 100.5km -> 101km
			},
			want:    2130,
			wantErr: false,
		},
		{
			name: "九州 混在 特定額 301km",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(3005), // 300.5km -> 301km
				GiseiKilo: domain.DeciKilo(3005), // 300.5km -> 301km
			},
			want:    6600,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CalculateKyushuFare(tt.params)
			if (err != nil) != tt.wantErr {
				t.Errorf("CalculateKyushuFare() err = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("CalculateKyushuFare() = %v, want %v", got, tt.want)
			}
		})
	}
}
