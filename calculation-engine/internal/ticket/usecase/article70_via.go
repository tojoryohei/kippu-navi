package usecase

import "calculation-engine/internal/ticket/graph"

// article70FareViaPath は、入力した新幹線の路線コードを保持して印字用経路を作る。
// 運賃用の在来線展開とは分けるが、太線区間と最短経路表は補正処理と共用する。
func article70FareViaPath(path []ViaStep, g graph.Graph) []ViaStep {
	loadViaData()
	names := viaStepNames(path)
	segments := boldViaSegments(names, g)
	result := path
	for i := len(segments) - 1; i >= 0; i-- {
		segment := segments[i]
		from, to := segment.start == 0, segment.end == len(path)-1
		if from == to { // エリア内完結と通過は発着用の補正をしない。
			continue
		}
		// 上野〜大宮を新幹線で出入りするときは、エリア内の在来線名を
		// 省略し、入力した新幹線乗換駅（東京または上野）から印字する。
		boundary := segment.end
		if to {
			boundary = segment.start - 1
		}
		if shinkansenLines[path[boundary].LineName] && stationPair(names[boundary], names[boundary+1]) == stationPair("上野", "大宮") {
			if from {
				start := segment.end
				for start > segment.start && shinkansenLines[path[start-1].LineName] {
					start--
				}
				result = result[start:]
			} else {
				end := segment.start
				for end < segment.end && shinkansenLines[path[end].LineName] {
					end++
				}
				result = result[:end+1]
			}
			continue
		}
		line := ""
		for j := segment.start; j < segment.end; j++ {
			if stationPair(names[j], names[j+1]) == stationPair("東京", "上野") && shinkansenLines[path[j].LineName] {
				line = path[j].LineName
				break
			}
		}
		if line == "" {
			continue
		}
		mode := "from"
		if to {
			mode = "to"
		}
		route := viaData.article70Routes.GetRoute(mode, names[segment.start], names[segment.end])
		steps := article70TokyoUenoVia(route, line)
		if len(steps) == 0 {
			continue // 発売可否は運賃補正で判定する。
		}
		steps[len(steps)-1].LineName = path[segment.end].LineName
		updated := make([]ViaStep, 0, len(result)+len(steps))
		updated = append(updated, result[:segment.start]...)
		updated = append(updated, steps...)
		updated = append(updated, result[segment.end+1:]...)
		result = updated
	}
	return result
}

func hasTokyoUenoVia(names []string) bool {
	for i := 0; i+1 < len(names); i++ {
		if stationPair(names[i], names[i+1]) == stationPair("東京", "上野") {
			return true
		}
	}
	return false
}

// 最短経路表の在来線区間を、要求された東京〜上野の新幹線に戻す。
// 路線コードは入力を使い、東北・上越・北陸新幹線の別を保持する。
func article70TokyoUenoVia(route []string, line string) []ViaStep {
	conventional := []string{"東京", "神田", "秋葉原", "御徒町", "上野"}
	steps := make([]ViaStep, 0, len(route))
	restored := false
	for i := 0; i < len(route); i++ {
		if i+len(conventional) <= len(route) {
			forward, reverse := true, true
			for j, name := range conventional {
				forward = forward && route[i+j] == name
				reverse = reverse && route[i+j] == conventional[len(conventional)-1-j]
			}
			if forward || reverse {
				steps = append(steps, ViaStep{StationName: route[i], LineName: line})
				i += len(conventional) - 2
				restored = true
				continue
			}
		}
		code := ""
		if i+1 < len(route) {
			pair := stationPair(route[i], route[i+1])
			code = viaData.physicalLineByPair[pair]
			if kana, configured := viaData.article70Kana[pair]; configured {
				code = ""
				if kana != nil {
					code = *kana
				}
			}
		}
		steps = append(steps, ViaStep{StationName: route[i], LineName: code})
	}
	if !restored {
		return nil
	}
	return steps
}
