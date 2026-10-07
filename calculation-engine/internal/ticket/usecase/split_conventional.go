package usecase

import (
	"calculation-engine/internal/domain"
	"calculation-engine/internal/split"
	"calculation-engine/internal/ticket/graph"
	_ "embed"
	"encoding/json"
	"fmt"
	"slices"
)

// 分割用の在来線置換区間は、運賃計算の新幹線展開用マッピングとは独立して定義します。
//
//go:embed split_conventional_routes.json
var splitConventionalData []byte

type splitConventionalRule struct {
	Name         string   `json:"name"`
	LineCodes    []string `json:"lineCodes"`
	Shinkansen   []string `json:"shinkansen"`
	Conventional []string `json:"conventional"`
	Source       string   `json:"source"`
	Eligibility  string   `json:"eligibility"`
}

var splitConventionalRules = func() []splitConventionalRule {
	var rules []splitConventionalRule
	if err := json.Unmarshal(splitConventionalData, &rules); err != nil {
		panic(err)
	}
	return rules
}()

type splitReplacement struct {
	start, end int
	path       []int
	sections   []splitReplacementSection
	disabled   bool
}

type splitReplacementSection struct {
	from, to string
	ruleName string
}

// 重複を避けるために新幹線のまま残した区間は、運賃計算用の展開で再び在来線に置換しません。
// 折り返し区間の重複控除と、その他の補正は維持します。
func splitPreparationCorrector(c PathCorrector) PathCorrector {
	switch v := c.(type) {
	case *PipelineCorrector:
		children := make([]PathCorrector, len(v.correctors))
		for i, child := range v.correctors {
			children[i] = splitPreparationCorrector(child)
		}
		return NewPipelineCorrector(children...)
	case *ShinkansenOverlapCorrector:
		return &ShinkansenOverlapCorrector{overlapDeductions: v.overlapDeductions}
	default:
		return c
	}
}

func replacementAt(steps []ViaStep, start int, g graph.Graph) (*splitReplacement, error) {
	for _, rule := range splitConventionalRules {
		from := slices.Index(rule.Shinkansen, steps[start].StationName)
		conventionalStart := slices.Index(rule.Conventional, steps[start].StationName)
		if from < 0 || conventionalStart < 0 || !slices.Contains(rule.LineCodes, steps[start].LineName) {
			continue
		}
		direction := 0
		for end := start + 1; end < len(steps); end++ {
			if !slices.Contains(rule.LineCodes, steps[end-1].LineName) {
				break
			}
			at := slices.Index(rule.Shinkansen, steps[end].StationName)
			if at < 0 {
				break
			}
			delta := at - from
			if direction == 0 {
				direction = delta
			}
			if (direction != 1 && direction != -1) || delta != direction {
				break
			}
			from = at
			to := slices.Index(rule.Conventional, steps[end].StationName)
			if to < 0 {
				continue
			} // 新幹線単独駅は区間の途中にある場合だけ置換し、発着駅の場合は残します。
			names := []string{}
			if to > conventionalStart {
				names = append(names, rule.Conventional[conventionalStart:to+1]...)
			} else {
				names = append(names, rule.Conventional[to:conventionalStart+1]...)
				slices.Reverse(names)
			}
			ids := make([]int, len(names))
			for i, name := range names {
				id, ok := g.GetID(name)
				if !ok {
					return nil, fmt.Errorf("在来線置き換えの駅が見つかりません: %s", name)
				}
				ids[i] = id
			}
			for i := 0; i < len(ids)-1; i++ {
				connected := false
				for _, edge := range g.GetEdges(ids[i]) {
					if edge.ToID == ids[i+1] && !shinkansenLines[edge.Line] {
						connected = true
						break
					}
				}
				if !connected {
					return nil, fmt.Errorf("在来線置き換えの経路が接続していません: %s〜%s", names[i], names[i+1])
				}
			}
			return &splitReplacement{
				start: start,
				end:   end,
				path:  ids,
				sections: []splitReplacementSection{{
					from:     steps[start].StationName,
					to:       steps[end].StationName,
					ruleName: rule.Name,
				}},
			}, nil
		}
	}
	return nil, nil
}

func (c *RouteTicketCalculator) prepareConventionalSplit(steps []ViaStep, original []int) ([]int, []split.RouteReplacement, error) {
	blocks := []*splitReplacement{}
	for i := 0; i < len(steps)-1; {
		block, err := replacementAt(steps, i, c.graph)
		if err != nil {
			return nil, nil, err
		}
		if block == nil {
			i++
			continue
		}
		blocks = append(blocks, block)
		i = block.end
	}
	target, err := resolveConventionalReplacements(original, blocks, splitPreparationCorrector(c.corrector), c.graph)
	if err != nil {
		return nil, nil, err
	}
	changes := []split.RouteReplacement{}
	changeRules := []string{}
	for _, b := range blocks {
		status := "replaced"
		if b.disabled {
			status = "retained_duplicate"
		}
		for _, section := range b.sections {
			last := len(changes) - 1
			if last >= 0 && changes[last].To == section.from && changes[last].Status == status && changeRules[last] == section.ruleName {
				changes[last].To = section.to
				continue
			}
			changes = append(changes, split.RouteReplacement{From: section.from, To: section.to, Status: status})
			changeRules = append(changeRules, section.ruleName)
		}
	}
	return target, changes, nil
}

// 通常補正で追加された駅も含め、置換区間が各補正を経てどこに移ったかを追跡します。
// 最長共通部分列（LCS）を使い、同じ駅の複数回の出現を区別します。
func correctSplitWithOrigins(corrector PathCorrector, path []int, origins [][]int, g graph.Graph) ([]int, [][]int, error) {
	if pipeline, ok := corrector.(*PipelineCorrector); ok {
		var err error
		for _, child := range pipeline.correctors {
			path, origins, err = correctSplitWithOrigins(child, path, origins, g)
			if err != nil {
				return nil, nil, err
			}
		}
		return path, origins, nil
	}
	result, err := corrector.Correct(path, g)
	if err != nil {
		return nil, nil, err
	}
	return result, propagateSplitOrigins(path, result, origins), nil
}

func propagateSplitOrigins(before, after []int, origins [][]int) [][]int {
	if slices.Equal(before, after) {
		return origins
	}
	width := len(after) + 1
	lcs := make([]int, (len(before)+1)*width)
	for i := len(before) - 1; i >= 0; i-- {
		for j := len(after) - 1; j >= 0; j-- {
			if before[i] == after[j] {
				lcs[i*width+j] = 1 + lcs[(i+1)*width+j+1]
			} else {
				lcs[i*width+j] = max(lcs[(i+1)*width+j], lcs[i*width+j+1])
			}
		}
	}
	type pair struct{ i, j int }
	matches := []pair{{-1, -1}}
	i, j := 0, 0
	for i < len(before) && j < len(after) {
		if before[i] == after[j] {
			matches = append(matches, pair{i, j})
			i++
			j++
		} else if lcs[(i+1)*width+j] >= lcs[i*width+j+1] {
			i++
		} else {
			j++
		}
	}
	matches = append(matches, pair{len(before), len(after)})
	out := make([][]int, len(after))
	for k := 1; k < len(matches); k++ {
		prev, next := matches[k-1], matches[k]
		if next.j < len(after) {
			out[next.j] = origins[next.i]
		}
		owners := []int{}
		for source := prev.i + 1; source < next.i; source++ {
			owners = append(owners, origins[source]...)
		}
		if next.i == prev.i+1 {
			if prev.i >= 0 {
				owners = append(owners, origins[prev.i]...)
			}
			if next.i < len(before) {
				owners = append(owners, origins[next.i]...)
			}
		}
		for dest := prev.j + 1; dest < next.j; dest++ {
			out[dest] = owners
		}
	}
	return out
}

// 置換区間ごとに駅の出現位置を追跡し、重複を生む置換だけを取り消します。
// 印字では補正を行わず、分割候補では従来どおり通常補正後の駅列で判定します。
func resolveConventionalReplacements(original []int, blocks []*splitReplacement, corrector PathCorrector, g graph.Graph) ([]int, error) {
	if len(original) == 0 {
		return nil, nil
	}
	for {
		assembled := []int{original[0]}
		origins := [][]int{nil}
		appendOriginal := func(path []int) {
			assembled = append(assembled, path...)
			for range path {
				origins = append(origins, nil)
			}
		}
		at := 0
		for index, b := range blocks {
			appendOriginal(original[at+1 : b.start+1])
			if b.disabled {
				appendOriginal(original[b.start+1 : b.end+1])
			} else {
				assembled = append(assembled, b.path[1:]...)
				for j := 1; j < len(b.path); j++ {
					// 接続駅は元から存在するため、置換で増えた途中駅だけに印を付けます。
					if j == len(b.path)-1 {
						origins = append(origins, nil)
					} else {
						origins = append(origins, []int{index})
					}
				}
			}
			at = b.end
		}
		appendOriginal(original[at+1:])
		target, targetOrigins := assembled, origins
		if corrector != nil {
			var err error
			target, targetOrigins, err = correctSplitWithOrigins(corrector, assembled, origins, g)
			if err != nil {
				return nil, err
			}
		}
		if !domain.HasDuplicateStation(target) {
			return target, nil
		}
		seen := map[int]int{}
		disabled := false
		for position, id := range target {
			if previous, exists := seen[id]; exists {
				// 終点で閉じる環状・6の字は既存の重複判定と同様に許容します。
				if position == len(target)-1 && (len(target) < 3 || id != target[len(target)-3]) {
					continue
				}
				for _, occurrence := range []int{previous, position} {
					for _, index := range targetOrigins[occurrence] {
						if !blocks[index].disabled {
							blocks[index].disabled = true
							disabled = true
						}
					}
				}
			}
			seen[id] = position
		}
		if !disabled {
			return nil, domain.ErrDuplicateRoute
		}
	}
}
