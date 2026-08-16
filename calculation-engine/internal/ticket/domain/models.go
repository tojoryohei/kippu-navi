package domain

import basedomain "calculation-engine/internal/domain"

// TicketFareParams は乗車券運賃計算の入力パラメータです。
type TicketFareParams struct {
	RouteType basedomain.RouteType
	EigyoKilo basedomain.DeciKilo
	GiseiKilo basedomain.DeciKilo
}

// RouteAndFare は経路完全一致で適用される特定区間運賃や調整区間運賃を保持します。
type RouteAndFare struct {
	Route []string
	Fare  int
}
