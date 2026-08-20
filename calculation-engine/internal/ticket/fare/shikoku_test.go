package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"testing"
)

func TestCalculateShikokuFare(t *testing.T) {
	tests := []struct {
		name    string
		params  ticketdomain.TicketFareParams
		want    int
		wantErr bool
	}{
		{
			name: "四国 10km以下 (擬制3km)",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(95), // 9.5km -> 10km
				GiseiKilo: domain.DeciKilo(25), // 2.5km -> 3km
			},
			want:    190,
			wantErr: false,
		},
		{
			name: "四国 10km超 11km",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(105), // 10.5km -> 11km
				GiseiKilo: domain.DeciKilo(105), // 10.5km -> 11km
			},
			want:    330,
			wantErr: false,
		},
		{
			name: "四国 100km超 101km",
			params: ticketdomain.TicketFareParams{
				LineType:  domain.LineTypeMixed,
				EigyoKilo: domain.DeciKilo(1005), // 100.5km -> 101km
				GiseiKilo: domain.DeciKilo(1005), // 100.5km -> 101km
			},
			want:    2310,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := CalculateShikokuFare(tt.params)
			if (err != nil) != tt.wantErr {
				t.Errorf("CalculateShikokuFare() err = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("CalculateShikokuFare() = %v, want %v", got, tt.want)
			}
		})
	}
}
