package fare_test

import (
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"testing"
)

func TestCalculateBarrierFreeFee(t *testing.T) {
	tests := []struct {
		name    string
		months  int
		want    int
		wantErr bool
	}{
		{"1ヶ月", 1, 300, false},
		{"3ヶ月", 3, 900, false},
		{"6ヶ月", 6, 1800, false},
		{"不正な月数", 4, 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := fare.CalculateBarrierFreeFee(tt.months)
			if (err != nil) != tt.wantErr {
				t.Errorf("CalculateBarrierFreeFee() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("CalculateBarrierFreeFee() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsBarrierFreeFeeApplicable(t *testing.T) {
	tests := []struct {
		name  string
		edges []*domain.Edge
		want  bool
	}{
		{
			name: "全てバリアフリー対象",
			edges: []*domain.Edge{
				{IsBarrierFreeSection: true},
				{IsBarrierFreeSection: true},
			},
			want: true,
		},
		{
			name: "一部がバリアフリー対象外",
			edges: []*domain.Edge{
				{IsBarrierFreeSection: true},
				{IsBarrierFreeSection: false},
			},
			want: false,
		},
		{
			name:  "エッジが空",
			edges: []*domain.Edge{},
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := fare.IsBarrierFreeFeeApplicable(tt.edges); got != tt.want {
				t.Errorf("IsBarrierFreeFeeApplicable() = %v, want %v", got, tt.want)
			}
		})
	}
}
