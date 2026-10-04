package usecase

import (
	"calculation-engine/internal/ticket/graph"
	"slices"
)

// 在来線の候補を優先し、新幹線の共用区間だけは複数候補を保持する。
func cheapestViaCandidates(conventional, shinkansen, private []edgeLineRecord) map[string][]string {
	result := make(map[string][]string)
	for _, edge := range conventional {
		key := stationPair(edge.Station0, edge.Station1)
		if len(result[key]) == 0 {
			result[key] = []string{edge.Line}
		}
	}
	for _, edges := range [][]edgeLineRecord{shinkansen, private} {
		for _, edge := range edges {
			key := stationPair(edge.Station0, edge.Station1)
			if len(result[key]) == 0 {
				result[key] = []string{edge.Line}
			}
		}
	}
	for _, pair := range [][2]string{{"東京", "上野"}, {"上野", "大宮"}} {
		key := stationPair(pair[0], pair[1])
		if len(result[key]) > 0 && shinkansenLines[result[key][0]] {
			result[key] = []string{"トホシ", "シヨシ", "ホクシ"}
		}
	}
	for _, pair := range [][2]string{{"大宮", "熊谷"}, {"熊谷", "本庄早稲田"}, {"本庄早稲田", "高崎"}} {
		key := stationPair(pair[0], pair[1])
		if len(result[key]) > 0 && shinkansenLines[result[key][0]] {
			result[key] = []string{"シヨシ", "ホクシ"}
		}
	}
	return result
}

func cheapestViaSteps(g graph.StationProvider, path []int) []ViaStep {
	loadViaData()
	names := make([]string, len(path))
	for i, id := range path {
		names[i] = g.GetName(id)
	}
	reversed := slices.Clone(names)
	slices.Reverse(reversed)
	reverse := slices.Compare(names, reversed) > 0
	if reverse {
		names = reversed
	}
	candidates := make([][]string, max(0, len(names)-1))
	lines := make([]string, len(candidates))
	for i := range candidates {
		candidates[i] = viaData.cheapestLinesByPair[stationPair(names[i], names[i+1])]
		if len(candidates[i]) > 0 {
			lines[i] = candidates[i][0]
		}
	}
	for start := 0; start < len(lines); {
		if !shinkansenLines[lines[start]] {
			start++
			continue
		}
		end := start + 1
		for end < len(lines) && shinkansenLines[lines[end]] {
			end++
		}
		copy(lines[start:end], chooseShinkansenVia(candidates[start:end]))
		start = end
	}
	if reverse {
		slices.Reverse(names)
		slices.Reverse(lines)
	}
	steps := make([]ViaStep, len(names))
	for i, name := range names {
		steps[i].StationName = name
		if i < len(lines) {
			steps[i].LineName = lines[i]
		}
	}
	return steps
}

// 後ろから最少切替回数を計算し、同点なら候補の定義順で選ぶ。
func chooseShinkansenVia(candidates [][]string) []string {
	costs := make([][]int, len(candidates))
	for i := len(candidates) - 1; i >= 0; i-- {
		costs[i] = make([]int, len(candidates[i]))
		if i+1 == len(candidates) {
			continue
		}
		for j, line := range candidates[i] {
			best := len(candidates) + 1
			for k, next := range candidates[i+1] {
				cost := costs[i+1][k]
				if line != next {
					cost++
				}
				best = min(best, cost)
			}
			costs[i][j] = best
		}
	}
	result := make([]string, len(candidates))
	for i, options := range candidates {
		best := len(candidates) + 1
		for j, line := range options {
			cost := costs[i][j]
			if i > 0 && result[i-1] != line {
				cost++
			}
			if cost < best {
				best = cost
				result[i] = line
			}
		}
	}
	return result
}
