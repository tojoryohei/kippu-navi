package fareio

import (
	ticketdomain "calculation-engine/internal/ticket/domain"
	"reflect"
	"testing"
)

func TestLoadPathAndFare(t *testing.T) {
	tests := []struct {
		name      string
		jsonData  []byte
		wantFares []ticketdomain.PathAndFare
		wantErr   bool
	}{
		{
			name: "正常系",
			jsonData: []byte(`[
				{
					"path": ["東京", "神田"],
					"fare": 150
				}
			]`),
			wantFares: []ticketdomain.PathAndFare{
				{
					Path: []string{"東京", "神田"},
					Fare:  150,
				},
			},
			wantErr: false,
		},
		{
			name:      "不正なJSONフォーマット",
			jsonData:  []byte(`invalid json`),
			wantFares: nil,
			wantErr:   true,
		},
		{
			name:      "空の配列",
			jsonData:  []byte(`[]`),
			wantFares: []ticketdomain.PathAndFare{},
			wantErr:   false,
		},
		{
			name: "未知のフィールドが含まれる",
			jsonData: []byte(`[
				{
					"path": ["東京", "神田"],
					"fare": 150,
					"Unknown": 999
				}
			]`),
			wantFares: nil,
			wantErr:   true,
		},
		{
			name:      "JSONデータの末尾に予期せぬデータが含まれる",
			jsonData:  []byte(`[] { "extra": 1 }`),
			wantFares: nil,
			wantErr:   true,
		},
		{
			name: "経路の駅数が1つしかない（バリデーションエラー）",
			jsonData: []byte(`[
				{
					"path": ["東京"],
					"fare": 150
				}
			]`),
			wantFares: nil,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotFares, err := loadPathAndFare(tt.jsonData)

			if (err != nil) != tt.wantErr {
				t.Errorf("loadPathAndFare() エラー = %v, 期待されるエラー発生 = %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr && !reflect.DeepEqual(gotFares, tt.wantFares) {
				t.Errorf("loadPathAndFare() 取得データ = %v, 期待値 = %v", gotFares, tt.wantFares)
			}
		})
	}
}

func TestNewRegistry(t *testing.T) {
	// 実際のデータを読み込んでパースできるかテスト
	r, err := NewRegistry()
	if err != nil {
		t.Fatalf("NewRegistry() 失敗: %v", err)
	}

	if r.GetSpecificFares() == nil {
		t.Error("specificFaresがnilです")
	}

	if r.GetAdjustedFares() == nil {
		t.Error("adjustedFaresがnilです")
	}
}
