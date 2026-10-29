package usecase

import "slices"

// pathEditは一時的に展開した駅列上の置換範囲（両端を含む）。
// 特例の判定位置を直接使い、補正前後の経路照合は行わない。
type pathEdit struct {
	start, end  int
	replacement []int
}

// applyProjectedEditsは置換に関係しない元の新幹線エッジを保持する。
// origins[i]はpath[i-1]→path[i]の元エッジ位置。
func applyProjectedEdits(original, path, origins []int, edits []pathEdit) []int {
	if len(edits) == 0 {
		return slices.Clone(original)
	}
	slices.SortFunc(edits, func(a, b pathEdit) int { return a.start - b.start })
	touched := make([]bool, len(original))
	for _, edit := range edits {
		for i := edit.start + 1; i <= edit.end; i++ {
			touched[origins[i]] = true
		}
		if edit.start > 0 && edit.start+1 < len(path) && origins[edit.start] == origins[edit.start+1] {
			touched[origins[edit.start]] = true
		}
		if edit.end > 0 && edit.end+1 < len(path) && origins[edit.end] == origins[edit.end+1] {
			touched[origins[edit.end]] = true
		}
	}
	var result []int
	nextEdit := 0
	for i := 0; i < len(path); {
		if nextEdit < len(edits) && edits[nextEdit].start == i {
			edit := edits[nextEdit]
			result = append(result, edit.replacement...)
			i = edit.end + 1
			nextEdit++
			continue
		}
		if i == 0 || i == len(path)-1 || origins[i] != origins[i+1] || touched[origins[i]] {
			result = append(result, path[i])
		}
		i++
	}
	return result
}
