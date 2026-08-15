package domain

import basedomain "calculation-engine/internal/domain"

// TicketFareParams は乗車券運賃計算の入力パラメータです。
type TicketFareParams struct {
	RouteType basedomain.RouteType
	EigyoKilo basedomain.DeciKilo
	GiseiKilo basedomain.DeciKilo
}
