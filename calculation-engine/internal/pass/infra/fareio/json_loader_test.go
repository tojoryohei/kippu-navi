//go:build !js || !wasm

package fareio

import (
	passdomain "calculation-engine/internal/pass/domain"
	"reflect"
	"testing"
)

func TestLoadPathAndFares(t *testing.T) {
	tests := []struct {
		name      string
		jsonData  []byte
		wantFares []passdomain.PathAndFare
		wantErr   bool
	}{
		{
			name: "正常系",
			jsonData: []byte(`[
				{
					"path": ["東京", "神田"],
					"fare": {
						"OneMonth": 1000,
						"ThreeMonth": 2850,
						"SixMonth": 5400
					}
				}
			]`),
			wantFares: []passdomain.PathAndFare{
				{
					Path: []string{"東京", "神田"},
					Fare: passdomain.PassPrice{
						OneMonth:   1000,
						ThreeMonth: 2850,
						SixMonth:   5400,
					},
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
			wantFares: []passdomain.PathAndFare{},
			wantErr:   false,
		},
		{
			name: "経路の駅数が1つしかない",
			jsonData: []byte(`[
				{
					"path": ["東京"],
					"fare": {
						"OneMonth": 1000,
						"ThreeMonth": 2850,
						"SixMonth": 5400
					}
				}
			]`),
			wantFares: nil,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotFares, err := loadPathAndFares(tt.jsonData, "test")
			if (err != nil) != tt.wantErr {
				t.Errorf("loadPathAndFares() エラー = %v, 期待されるエラー = %v", err, tt.wantErr)
				return
			}
			if !tt.wantErr && !reflect.DeepEqual(gotFares, tt.wantFares) {
				t.Errorf("loadPathAndFares() 取得データ = %v, 期待値 = %v", gotFares, tt.wantFares)
			}
		})
	}
}
