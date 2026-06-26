//go:build !js || !wasm

package fareio_test


import (
	"os"
	"path/filepath"
	"reflect"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/infra/fareio"
	"testing"
)

func TestRouteAndFareJSONLoader_Load(t *testing.T) {
	tmpDir := t.TempDir()

	tests := []struct {
		name      string
		filename  string
		setup     func(path string)
		wantFares []domain.RouteAndFare
		wantErr   bool
	}{
		{
			name:     "正常系",
			filename: "valid.json",
			setup: func(path string) {
				jsonData := `[
					{
						"route": ["東京", "神田"],
						"fare": {
							"OneMonth": 1000,
							"ThreeMonth": 2850,
							"SixMonth": 5400
						}
					}
				]`
				_ = os.WriteFile(path, []byte(jsonData), 0644)
			},
			wantFares: []domain.RouteAndFare{
				{
					Route: []string{"東京", "神田"},
					Fare: domain.PassPrice{
						OneMonth:   1000,
						ThreeMonth: 2850,
						SixMonth:   5400,
					},
				},
			},
			wantErr: false,
		},
		{
			name:     "ファイルが存在しない",
			filename: "nonexistent.json",
			setup: func(path string) {
				// ファイルを作成しない
			},
			wantFares: nil,
			wantErr:   true,
		},
		{
			name:     "不正なJSONフォーマット",
			filename: "invalid.json",
			setup: func(path string) {
				_ = os.WriteFile(path, []byte(`invalid json`), 0644)
			},
			wantFares: nil,
			wantErr:   true,
		},
		{
			name:     "空の配列",
			filename: "empty.json",
			setup: func(path string) {
				_ = os.WriteFile(path, []byte(`[]`), 0644)
			},
			wantFares: []domain.RouteAndFare{},
			wantErr:   false,
		},
		{
			name:     "未知のフィールドが含まれる（DisallowUnknownFieldsの検証）",
			filename: "unknown_field.json",
			setup: func(path string) {
				jsonData := `[
					{
						"route": ["東京", "神田"],
						"fare": {
							"OneMonth": 1000,
							"ThreeMonth": 2850,
							"SixMonth": 5400,
							"Unknown": 999
						}
					}
				]`
				_ = os.WriteFile(path, []byte(jsonData), 0644)
			},
			wantFares: nil,
			wantErr:   true,
		},
		{
			name:     "JSONデータの末尾に予期せぬデータが含まれる",
			filename: "trailing_data.json",
			setup: func(path string) {
				jsonData := `[] { "extra": 1 }`
				_ = os.WriteFile(path, []byte(jsonData), 0644)
			},
			wantFares: nil,
			wantErr:   true,
		},
		{
			name:     "経路の駅数が1つしかない（バリデーションエラー）",
			filename: "short_route.json",
			setup: func(path string) {
				jsonData := `[
					{
						"route": ["東京"],
						"fare": {
							"OneMonth": 1000,
							"ThreeMonth": 2850,
							"SixMonth": 5400
						}
					}
				]`
				_ = os.WriteFile(path, []byte(jsonData), 0644)
			},
			wantFares: nil,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			jsonPath := filepath.Join(tmpDir, tt.filename)
			tt.setup(jsonPath)

			loader := &fareio.RouteAndFareJSONLoader{}
			gotFares, err := loader.Load(jsonPath)

			if (err != nil) != tt.wantErr {
				t.Errorf("Load() エラー = %v, 期待されるエラー発生 = %v", err, tt.wantErr)
				return
			}

			if !tt.wantErr && !reflect.DeepEqual(gotFares, tt.wantFares) {
				t.Errorf("Load() 取得データ = %v, 期待値 = %v", gotFares, tt.wantFares)
			}
		})
	}
}
