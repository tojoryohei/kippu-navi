package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"testing"
)

func TestCalculateEastFare(t *testing.T) {
	tests := []struct {
		name    string
		params  ticketdomain.TicketFareParams
		want    int
		wantErr bool
	}{
		{
			name: "東日本 幹線のみ 10km",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(95), // 9.5km -> 10km
			},
			want:    210,
			wantErr: false,
		},
		{
			name: "東日本 地方交通線のみ 10km",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(95), // 9.5km -> 10km
			},
			want:    220,
			wantErr: false,
		},
		{
			name: "東日本 地方交通線のみ 11km",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(105), // 10.5km -> 11km
			},
			want:    260,
			wantErr: false,
		},
		{
			name: "東日本 特定額 201km",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(2005), // 200.5km -> 201km
			},
			want:    3850,
			wantErr: false,
		},
		{
			name: "東日本 幹線・地方交通線混在 10km以下 (地方交通線運賃)",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(95),
			},
			want:    220,
			wantErr: false,
		},
		{
			name: "東日本 幹線・地方交通線混在 100km (擬制100km)",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(950),
				GiseiKilo: domain.DeciKilo(1000),
			},
			want:    1790,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CalculateEastFare(tt.params)
			if (err != nil) != tt.wantErr {
				t.Errorf("CalculateEastFare() err = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("CalculateEastFare() = %v, want %v", got, tt.want)
			}
		})
	}
}
