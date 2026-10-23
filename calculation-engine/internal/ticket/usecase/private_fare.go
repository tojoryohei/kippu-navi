package usecase

import (
	"fmt"

	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
)

type privateFareSection struct {
	company, start, end string
}

// calculatePrivateFare は連続する会社線を会社ごとに通算する。
// 呼び出しごとに1枚の乗車券を評価するため、特定運賃を分割券間に適用しない。
func (u *CalculateAmount) calculatePrivateFare(edges []*ticketdomain.TicketEdge) (int, error) {
	total := 0
	for i := 0; i < len(edges); {
		if edges[i].Company != domain.Other {
			i++
			continue
		}
		loadViaData()
		var sections []privateFareSection
		for i < len(edges) && edges[i].Company == domain.Other {
			edge := edges[i]
			company := privateCompany(edge.Line)
			if company == "" {
				return 0, fmt.Errorf("私鉄の会社が未登録です: %s (%s - %s)", edge.Line, u.graph.GetName(edge.FromID), u.graph.GetName(edge.ToID))
			}
			start := u.graph.GetName(edge.FromID)
			end := u.graph.GetName(edge.ToID)
			if len(sections) > 0 && sections[len(sections)-1].company == company {
				sections[len(sections)-1].end = end
			} else {
				sections = append(sections, privateFareSection{company, start, end})
			}
			i++
		}
		for _, section := range sections {
			f, ok := u.privateFareReg.GetFare(section.company, section.start, section.end)
			if !ok {
				return 0, fmt.Errorf("運賃が未登録です: %s: %s - %s", section.company, section.start, section.end)
			}
			total += f
		}
		// 根拠: https://www.ishikawa-railway.jp/station/tsubata/
		// 津幡―高岡の特定運賃。発着区間と会社境界が一致する場合だけ90円を控除。
		// 金沢―高岡・津幡―富山など、この区間を含む長距離の通算運賃には適用しない。
		if len(sections) == 2 {
			a, b := sections[0], sections[1]
			if a.company == "とやま鉄道" {
				a, b = privateFareSection{b.company, b.end, b.start}, privateFareSection{a.company, a.end, a.start}
			}
			if a == (privateFareSection{"いしかわ", "津幡", "倶利伽羅"}) && b == (privateFareSection{"とやま鉄道", "倶利伽羅", "高岡"}) {
				total -= 90
			}
		}
	}
	return total, nil
}
