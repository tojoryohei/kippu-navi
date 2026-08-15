package domain

import cDomain "calculation-engine/internal/domain"

// TicketFareParams は乗車券運賃計算の入力パラメータです。
type TicketFareParams struct {
	EigyoKilo cDomain.DeciKilo
	GiseiKilo cDomain.DeciKilo
}
