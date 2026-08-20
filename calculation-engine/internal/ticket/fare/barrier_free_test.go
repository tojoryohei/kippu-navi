package fare_test

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/fare"
	"testing"
)

func TestIsAllBarrierFreeFeeApplicable(t *testing.T) {
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
			name:  "空の経路",
			edges: []*domain.Edge{},
			want:  false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := fare.IsAllBarrierFreeFeeApplicable(tt.edges); got != tt.want {
				t.Errorf("IsAllBarrierFreeFeeApplicable() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestCalculateBarrierFreeFee(t *testing.T) {
	if got := fare.CalculateBarrierFreeFee(); got != 10 {
		t.Errorf("CalculateBarrierFreeFee() = %v, want 10", got)
	}
}
