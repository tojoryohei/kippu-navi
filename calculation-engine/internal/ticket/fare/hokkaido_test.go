package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"testing"
)

func TestCalculateHokkaidoFare(t *testing.T) {
	tests := []struct {
		name    string
		params  ticketdomain.TicketFareParams
		want    int
		wantErr bool
	}{
		{
			name: "北海道 幹線のみ 10km",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeTrunkOnly,
				EigyoKilo: domain.DeciKilo(95), // 9.5km -> 10km
			},
			want:    310,
			wantErr: false,
		},
		{
			name: "北海道 地方交通線のみ 10km",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(95), // 9.5km -> 10km
			},
			want:    320,
			wantErr: false,
		},
		{
			name: "北海道 地方交通線のみ 11km",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeLocalOnly,
				EigyoKilo: domain.DeciKilo(105), // 10.5km -> 11km
			},
			want:    360,
			wantErr: false,
		},
		{
			name: "北海道 幹線・地方交通線混在 10km以下 (地方交通線運賃)",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(95),
			},
			want:    320,
			wantErr: false,
		},
		{
			name: "北海道 幹線・地方交通線混在 11km (擬制11km)",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(105),
				GiseiKilo: domain.DeciKilo(105), // 10.5km -> 11km
			},
			want:    360,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CalculateHokkaidoFare(tt.params)
			if (err != nil) != tt.wantErr {
				t.Errorf("CalculateHokkaidoFare() err = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("CalculateHokkaidoFare() = %v, want %v", got, tt.want)
			}
		})
	}
}
