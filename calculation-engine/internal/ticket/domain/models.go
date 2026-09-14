package domain

import basedomain "calculation-engine/internal/domain"

// TicketFareParams は乗車券運賃計算の入力パラメータです。
type TicketFareParams struct {
	LineType  basedomain.LineType
	EigyoKilo basedomain.DeciKilo
	GiseiKilo basedomain.DeciKilo
}

// PathAndFare は経路完全一致で適用される特定区間運賃や調整区間運賃を保持します。
type PathAndFare struct {
	Path []string
	Fare int
}

// RouteExtension は、入力経路と、それに対応する延長経路を保持します。
// 経路は駅名で保持し、実行時にグラフの駅IDへ解決します。
type RouteExtension struct {
	InputPath  []string `json:"inputPath"`
	OutputPath []string `json:"outputPath"`
}

// RouteExtensionIDs は、WASM実行時に利用する駅IDベースの経路延長対応表です。
// 駅名JSONを実行バイナリへ埋め込まず、グラフの駅IDだけを保持します。
type RouteExtensionIDs struct {
	InputPath  []int32
	OutputPath []int32
}
