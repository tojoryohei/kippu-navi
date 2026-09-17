package usecase

import (
	basedomain "calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
)

// CalculateTicketValidDays は、乗車券の有効日数を計算します。
// 大都市近郊区間完結の判定には、新幹線展開前の経路を使用します。
func CalculateTicketValidDays(totalPathEigyoKilo basedomain.DeciKilo, suburbanPath []int, g graph.Graph) int {
	if IsSuburbanAreaComplete(suburbanPath, g) {
		return 1
	}
	return ticketdomain.CalculateValidDaysFromKilo(totalPathEigyoKilo)
}
