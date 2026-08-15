package domain

import "calculation-engine/internal/domain"

// TicketEdge は乗車券の経路探索および運賃計算で用いられる駅間データ構造です。
type TicketEdge struct {
	domain.Edge
	Line           string
	IsBoldLineArea bool
}
