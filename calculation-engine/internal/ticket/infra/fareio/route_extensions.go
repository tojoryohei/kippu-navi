package fareio

import (
	"bytes"
	_ "embed"
	"encoding/json"
	"fmt"
	"io"

	ticketdomain "calculation-engine/internal/ticket/domain"
)

//go:embed data/routeMappings.json
var routeMappingsJSON []byte

// RouteExtensionRegistry は入力経路と延長経路の対応表を保持します。
type RouteExtensionRegistry struct {
	routes []ticketdomain.RouteExtension
}

// NewRouteExtensionRegistry は埋め込みJSONから対応表を読み込みます。
func NewRouteExtensionRegistry() (*RouteExtensionRegistry, error) {
	var routes []ticketdomain.RouteExtension
	decoder := json.NewDecoder(bytes.NewReader(routeMappingsJSON))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&routes); err != nil {
		return nil, fmt.Errorf("経路延長対応表の読み込みに失敗しました: %w", err)
	}
	var extra any
	if err := decoder.Decode(&extra); err != io.EOF {
		if err == nil {
			return nil, fmt.Errorf("経路延長対応表の末尾に予期せぬデータがあります")
		}
		return nil, fmt.Errorf("経路延長対応表の末尾データの読み込みに失敗しました: %w", err)
	}
	return &RouteExtensionRegistry{routes: routes}, nil
}

// GetRouteExtensions は入力経路と延長経路の対応表を返します。
func (r *RouteExtensionRegistry) GetRouteExtensions() []ticketdomain.RouteExtension {
	if r == nil {
		return nil
	}
	return r.routes
}

// GetGeneratedRouteExtensions は、WASMへ組み込む駅IDベースの対応表を返します。
// 戻り値は静的データを共有するため、呼び出し側で書き換えてはいけません。
func GetGeneratedRouteExtensions() []ticketdomain.RouteExtensionIDs {
	return generatedRouteMappings
}
