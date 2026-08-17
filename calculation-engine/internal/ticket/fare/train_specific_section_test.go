package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"testing"
)

func TestTrainSpecificSectionCalculator_Calculate(t *testing.T) {
	calc := NewTrainSpecificSectionCalculator()

	tests := []struct {
		name    string
		params  ticketdomain.TicketFareParams
		want    int
		wantErr bool
	}{
		{
			name: "電車特定区間 3km以下",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeTrunkOnly,
				GiseiKilo: domain.DeciKilo(25), // 2.5km -> 3km
			},
			want:    140,
			wantErr: false,
		},
		{
			name: "電車特定区間 4〜6km",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeTrunkOnly,
				GiseiKilo: domain.DeciKilo(55), // 5.5km -> 6km
			},
			want:    170,
			wantErr: false,
		},
		{
			name: "電車特定区間 7〜10km",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeTrunkOnly,
				GiseiKilo: domain.DeciKilo(95), // 9.5km -> 10km
			},
			want:    190,
			wantErr: false,
		},
		{
			name: "電車特定区間 11km〜50km (例: 15km)",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeTrunkOnly,
				GiseiKilo: domain.DeciKilo(145), // 14.5km -> 15km
			},
			want:    230,
			wantErr: false, // 15km -> splitKilo = 13 -> 1550 * 13 = 20150 -> ceil1000(20150) = 21000 -> 21000 * 1.1 = 23100 -> round1000(23100) = 23000 -> 230
		},
		{
			name: "電車特定区間 100km超 (例: 101km)",
			params: ticketdomain.TicketFareParams{
				LineType: domain.LineTypeTrunkOnly,
				GiseiKilo: domain.DeciKilo(1005), // 100.5km -> 101km
			},
			want:    1870,
			wantErr: false, // 101km -> splitKilo = 110 -> 1550 * 110 = 170500 -> round10000(170500) = 170000 -> 170000 * 1.1 = 187000 -> round1000(187000) = 187000 -> 1870
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calc.Calculate(tt.params)
			if (err != nil) != tt.wantErr {
				t.Errorf("Calculate() err = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("Calculate() = %v, want %v", got, tt.want)
			}
		})
	}
}
