package fareio

import (
	"bytes"
	"calculation-engine/internal/graphdata"
	"encoding/json"
	"fmt"
	"io"
	"reflect"
	"testing"

	ticketdomain "calculation-engine/internal/ticket/domain"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
)

func TestRouteExtensionJSONContainsPathsOnly(t *testing.T) {
	var records []map[string]json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(routeExtensionsJSON))
	if err := decoder.Decode(&records); err != nil {
		t.Fatalf("routeExtensions.jsonの読み込みに失敗しました: %v", err)
	}
	if len(records) != 0 {
		t.Fatalf("削除済みの経路延長対応表にレコードが残っています: got=%d", len(records))
	}
	for i, record := range records {
		if len(record) != 2 {
			t.Fatalf("経路延長対応表[%d]に経路以外の項目があります: %v", i, record)
		}
		if _, ok := record["inputPath"]; !ok {
			t.Fatalf("経路延長対応表[%d]にinputPathがありません", i)
		}
		if _, ok := record["outputPath"]; !ok {
			t.Fatalf("経路延長対応表[%d]にoutputPathがありません", i)
		}
	}
}

func TestGeneratedRouteExtensionsMatchSourceJSON(t *testing.T) {
	registry, err := NewRouteExtensionRegistry()
	if err != nil {
		t.Fatalf("経路延長対応表の読み込みに失敗しました: %v", err)
	}
	loader := &ticketgraphio.JSONLoader{}
	_, g, err := loader.LoadSeparatedGraphs([]io.Reader{graphdata.GetEdgesReader()}, []io.Reader{graphdata.GetVirtualEdgesReader()})
	if err != nil {
		t.Fatalf("グラフの読み込みに失敗しました: %v", err)
	}
	if len(generatedRouteExtensions) != len(registry.GetRouteExtensions()) {
		t.Fatalf("生成済み対応表の件数が一致しません: generated=%d source=%d", len(generatedRouteExtensions), len(registry.GetRouteExtensions()))
	}
	for i, source := range registry.GetRouteExtensions() {
		input, err := resolvePathForGeneratedTest(source.InputPath, g)
		if err != nil {
			t.Fatalf("対応表[%d]入力経路: %v", i, err)
		}
		output, err := resolvePathForGeneratedTest(source.OutputPath, g)
		if err != nil {
			t.Fatalf("対応表[%d]出力経路: %v", i, err)
		}
		generated := generatedRouteExtensions[i]
		if !reflect.DeepEqual(generated.InputPath, toInt32PathForGeneratedTest(input)) || !reflect.DeepEqual(generated.OutputPath, toInt32PathForGeneratedTest(output)) {
			t.Fatalf("生成済み対応表[%d]が元JSONと一致しません", i)
		}
	}
}

func resolvePathForGeneratedTest(names []string, g interface{ GetID(string) (int, bool) }) ([]int, error) {
	path := make([]int, len(names))
	for i, name := range names {
		id, ok := g.GetID(name)
		if !ok {
			return nil, fmt.Errorf("駅が見つかりません: %s", name)
		}
		path[i] = id
	}
	return path, nil
}

func toInt32PathForGeneratedTest(path []int) []int32 {
	result := make([]int32, len(path))
	for i, id := range path {
		result[i] = int32(id)
	}
	return result
}

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
					Fare: 150,
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
