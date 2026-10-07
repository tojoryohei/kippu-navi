package usecase

import "slices"

// 最安の経由印字専用。単独駅を通過する完全な駅列だけを置換する。
// 運賃計算の駅列や分割候補は変更せず、単独駅発着・途中折返しは維持する。
func conventionalThroughVia(steps []ViaStep) []ViaStep {
	rules := []struct {
		stations []string
		code     string
		via      []ViaStep
	}{
		{[]string{"三島", "（東）新富士", "静岡"}, "シンカ", []ViaStep{{StationName: "三島", LineName: "トウカ"}}},
		{[]string{"名古屋", "岐阜羽島", "米原"}, "シンカ", []ViaStep{{StationName: "名古屋", LineName: "トウカ"}}},
		{[]string{"新大阪", "新神戸", "西明石"}, "シンカ", []ViaStep{{StationName: "新大阪", LineName: "トウカ"}, {StationName: "神戸", LineName: "サンヨ"}}},
		{[]string{"福山", "新尾道", "三原"}, "シンカ", []ViaStep{{StationName: "福山", LineName: "サンヨ"}}},
		{[]string{"三原", "東広島", "広島"}, "シンカ", []ViaStep{{StationName: "三原", LineName: "サンヨ"}}},
		{[]string{"広島", "新岩国", "徳山"}, "シンカ", []ViaStep{{StationName: "広島", LineName: "サンヨ"}, {StationName: "岩国", LineName: "カント"}, {StationName: "櫛ケ浜", LineName: "サンヨ"}}},
		{[]string{"（北）福島", "白石蔵王", "仙台"}, "トホシ", []ViaStep{{StationName: "（北）福島", LineName: "トウホ"}}},
		{[]string{"仙台", "古川", "くりこま高原", "一ノ関"}, "トホシ", []ViaStep{{StationName: "仙台", LineName: "トウホ"}}},
		{[]string{"北上", "新花巻", "盛岡"}, "トホシ", []ViaStep{{StationName: "北上", LineName: "トウホ"}}},
		{[]string{"熊谷", "本庄早稲田", "高崎"}, "シヨシ", []ViaStep{{StationName: "熊谷", LineName: "タカサ"}}},
		{[]string{"高崎", "上毛高原", "越後湯沢"}, "シヨシ", []ViaStep{{StationName: "高崎", LineName: "シヨエ"}}},
		{[]string{"長岡", "燕三条", "新潟"}, "シヨシ", []ViaStep{{StationName: "長岡", LineName: "シンエ"}}},
		{[]string{"熊谷", "本庄早稲田", "高崎"}, "ホクシ", []ViaStep{{StationName: "熊谷", LineName: "タカサ"}}},
		{[]string{"博多", "新鳥栖", "久留米"}, "キユシ", []ViaStep{{StationName: "博多", LineName: "カコシ"}}},
		{[]string{"筑後船小屋", "新大牟田", "新玉名", "熊本"}, "キユシ", []ViaStep{{StationName: "筑後船小屋", LineName: "カコシ"}}},
	}
	// 印字を省略する前の全駅列で比較できるよう、駅名に一時的なIDを割り当てます。
	ids := map[string]int{}
	idFor := func(name string) int {
		if id, ok := ids[name]; ok {
			return id
		}
		id := len(ids)
		ids[name] = id
		return id
	}
	original := make([]int, len(steps))
	for i, step := range steps {
		original[i] = idFor(step.StationName)
	}
	blocks := []*splitReplacement{}
	printed := map[int][]ViaStep{}
	for i := 0; i < len(steps); {
		matched := false
		for _, rule := range rules {
			for _, reverse := range []bool{false, true} {
				n := len(rule.stations)
				if i+n > len(steps) {
					continue
				}
				ok := true
				for j := 0; j < n; j++ {
					k := j
					if reverse {
						k = n - 1 - j
					}
					if steps[i+j].StationName != rule.stations[k] || (j < n-1 && steps[i+j].LineName != rule.code) {
						ok = false
						break
					}
				}
				if !ok {
					continue
				}
				// 分割候補と同じ在来線駅列を使い、接続駅間を一つの置換単位にします。
				var names []string
				for _, corridor := range splitConventionalRules {
					if !slices.Contains(corridor.LineCodes, rule.code) {
						continue
					}
					from := slices.Index(corridor.Conventional, steps[i].StationName)
					to := slices.Index(corridor.Conventional, steps[i+n-1].StationName)
					if from < 0 || to < 0 {
						continue
					}
					if from < to {
						names = slices.Clone(corridor.Conventional[from : to+1])
					} else {
						names = slices.Clone(corridor.Conventional[to : from+1])
						slices.Reverse(names)
					}
					break
				}
				if len(names) == 0 {
					continue
				}
				path := make([]int, len(names))
				for j, name := range names {
					path[j] = idFor(name)
				}
				blocks = append(blocks, &splitReplacement{start: i, end: i + n - 1, path: path})
				var result []ViaStep
				if reverse {
					for j := len(rule.via) - 1; j >= 0; j-- {
						name := rule.stations[n-1]
						if j+1 < len(rule.via) {
							name = rule.via[j+1].StationName
						}
						result = append(result, ViaStep{StationName: name, LineName: rule.via[j].LineName})
					}
				} else {
					result = append(result, rule.via...)
				}
				printed[i] = result
				i += n - 1
				matched = true
				break
			}
			if matched {
				break
			}
		}
		if !matched {
			i++
		}
	}
	if _, err := resolveConventionalReplacements(original, blocks, nil, nil); err != nil {
		// 任意の印字用置換で成立しない場合は、元の経由を保持します。
		return slices.Clone(steps)
	}
	result := make([]ViaStep, 0, len(steps))
	at := 0
	for _, block := range blocks {
		result = append(result, steps[at:block.start]...)
		if block.disabled {
			result = append(result, steps[block.start:block.end]...)
		} else {
			result = append(result, printed[block.start]...)
		}
		at = block.end
	}
	return append(result, steps[at:]...)
}
