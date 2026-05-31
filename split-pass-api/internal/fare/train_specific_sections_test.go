package fare_test

import (
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph/data"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/infra/graphio"
	"testing"
)

func TestTrainSpecificSectionsCalculator_Calculate(t *testing.T) {
	loader := &graphio.JSONLoader{}
	g, err := loader.Load(data.GetEdgesReader())
	if err != nil {
		t.Fatalf("グラフデータのロードに失敗: %v", err)
	}
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		t.Fatalf("TrainSpecificSectionCalculatorの初期化に失敗しました: %v", err)
	}
	calc := calcs.TrainSpecific

	tests := []struct {
		name    string
		params  domain.PassFareParams
		want    int
		wantErr bool
	}{
		{
			name: "10km 1ヶ月",
			params: domain.PassFareParams{
				EigyoKilo: 100, // 10.0km -> ceil 10
				GiseiKilo: 100,
				Months:    1,
			},
			want: 5350,
		},
		{
			name: "15km 3ヶ月",
			params: domain.PassFareParams{
				EigyoKilo: 150, // 15.0km -> ceil 15
				GiseiKilo: 150,
				Months:    3,
			},
			want: 19040,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := calc.Calculate(tt.params)
			if (err != nil) != tt.wantErr {
				t.Errorf("Calculate() error = %v, wantErr %v", err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("Calculate() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestIsAllTrainSpecificApplicable(t *testing.T) {
	tests := []struct {
		name  string
		edges []*domain.Edge
		want  bool
	}{
		{
			name: "全て電車特定区間",
			edges: []*domain.Edge{
				{IsTrainSpecificSection: true},
				{IsTrainSpecificSection: true},
			},
			want: true,
		},
		{
			name: "一部が電車特定区間外",
			edges: []*domain.Edge{
				{IsTrainSpecificSection: true},
				{IsTrainSpecificSection: false},
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
			if got := fare.IsAllTrainSpecificApplicable(tt.edges); got != tt.want {
				t.Errorf("IsAllTrainSpecificApplicable() = %v, want %v", got, tt.want)
			}
		})
	}
}
