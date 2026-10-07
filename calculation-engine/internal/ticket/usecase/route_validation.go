package usecase

import (
	"calculation-engine/internal/domain"
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
	return NewPipelineCorrector(NewRule43_2Corrector(), overlap)
}

// validateInputPath は、新幹線の展開と重複控除の後に、残った重複を判定します。
// モード別の補正で重複が消える前に検証し、運賃計算と分割候補の準備に使う元の経路は保持します。
func (c *RouteTicketCalculator) validateInputPath(path []int) error {
	expanded, err := c.inputPathCorrector.Correct(append([]int(nil), path...), c.graph)
	if err != nil {
		return err
	}
	if domain.HasDuplicateStation(expanded) {
		return domain.ErrDuplicateRoute
	}
	return nil
}
