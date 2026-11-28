package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/ticket/graph"
)

// newInputPathCorrector は、重複判定だけに使う補正を構成します。
// 第43条の2の接続条件は、検証用の展開で駅列が変わる前に判定します。
func newInputPathCorrector() PathCorrector {
	overlap := NewShinkansenOverlapCorrector()
	// 運賃計算・経由印字・分割候補用の置換には追加しません。
	overlap.mappings = append(overlap.mappings, []string{"新下関", "幡生", "下関", "門司", "小倉"})
	kagoshima := []string{
		"小倉", "西小倉", "九州工大前", "戸畑", "枝光", "スペースワールド", "八幡", "黒崎", "陣原", "折尾",
		"水巻", "遠賀川", "海老津", "教育大前", "赤間", "東郷", "東福間", "福間", "千鳥", "古賀", "ししぶ",
		"新宮中央", "福工大前", "九産大前", "香椎", "千早", "箱崎", "吉塚", "博多",
	}
	// 第43条の2で片側・両側を控除した後の仮想エッジも、残る区間だけ展開します。
	for _, start := range []int{0, 1} {
		for _, end := range []int{len(kagoshima), len(kagoshima) - 1} {
			overlap.mappings = append(overlap.mappings, kagoshima[start:end])
		}
	}
	return NewPipelineCorrector(NewRule43_2Corrector(), &conventionalPathCorrector{overlap})
}

var ticketOverlapCorrector = newInputPathCorrector()

func (c *RouteTicketCalculator) validateInputPath(path []int) error {
	return validateTicketOverlap(path, c.graph)
}

// 新幹線と在来線の重複は、特例を反映した展開後の駅列でも検証する。
func validateTicketOverlap(path []int, g graph.Graph) error {
	if hasDuplicateTicketStation(path, g) {
		return domain.ErrDuplicateRoute
	}
	expanded, err := ticketOverlapCorrector.Correct(append([]int(nil), path...), g)
	if err != nil {
		return err
	}
	if hasDuplicateTicketStation(expanded, g) {
		return domain.ErrDuplicateRoute
	}
	return nil
}

func hasDuplicateTicketStation(path []int, g graph.Graph) bool {
	if g == nil {
		return domain.HasDuplicateStation(path)
	}
	return domain.HasDuplicateStationOnMixedRoute(path, func(from, to int) bool {
		return isPrivateTicketEdge(from, to, g)
	})
}

func isPrivateTicketInterior(path []int, i int, g graph.Graph) bool {
	return g != nil && domain.PrivateInteriorStation(path, i, func(from, to int) bool {
		return isPrivateTicketEdge(from, to, g)
	})
}

func isPrivateTicketEdge(from, to int, g graph.Graph) bool {
	for _, edge := range g.GetEdges(from) {
		if edge.ToID == to {
			return edge.Company == domain.Other
		}
	}
	return false
}
