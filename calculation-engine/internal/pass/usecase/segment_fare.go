package usecase

import (
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"math"
)

// ComputeCheapestNoSplit は事前計算と端末内検索で共有する区間運賃の評価規則です。
func ComputeCheapestNoSplit(
	g *graph.RailwayGraph,
	calc *CalculateAmount,
	rules []passdomain.ResolvedBypassRule,
	prevGisei, prevEigyo []int,
	start, end, months int,
) int {
	var cands [][]int

	// ① 最短営業キロ経路
	pathEigyo := reconstructPath(prevEigyo, start, end)
	if len(pathEigyo) >= 2 {
		cands = append(cands, pathEigyo)
	}

	// ② 最短擬制キロ経路
	pathGisei := reconstructPath(prevGisei, start, end)
	if len(pathGisei) >= 2 {
		cands = append(cands, pathGisei)
	}

	// ③ 経路全体が1つの特例に含まれる場合のみ、近道の経路
	for _, rule := range rules {
		aOnRule := containsStation(rule.ShortcutPath, start) || containsStation(rule.DetourPath, start)
		bOnRule := containsStation(rule.ShortcutPath, end) || containsStation(rule.DetourPath, end)
		if aOnRule && bOnRule {
			aOnDetourMiddle := isOnDetourMiddle(start, rule)
			bOnDetourMiddle := isOnDetourMiddle(end, rule)
			if aOnDetourMiddle || bOnDetourMiddle {
				shortcutPath := make([]int, len(rule.ShortcutPath))
				copy(shortcutPath, rule.ShortcutPath)
				cands = append(cands, shortcutPath)
			}
		}
	}

	// ④ 発着駅が遠回り上にあるが、完全に内包されていない場合、経由していない方の分岐駅まで特例の近道経路（オーバーシュート）
	for _, rule := range rules {
		startOnDetour := isOnDetourMiddle(start, rule)
		endOnDetour := isOnDetourMiddle(end, rule)

		if startOnDetour {
			// Option A: J1 から進入
			pathJ2ToEnd, err := g.FindShortestPathGisei(rule.ShortcutPath[len(rule.ShortcutPath)-1], end)
			if err == nil && len(pathJ2ToEnd.StationIDs) >= 2 {
				cand := append([]int(nil), rule.ShortcutPath...)
				cand = append(cand, pathJ2ToEnd.StationIDs[1:]...)
				cands = append(cands, cand)
			}

			// Option B: J2 から進入
			pathJ1ToEnd, err := g.FindShortestPathGisei(rule.ShortcutPath[0], end)
			if err == nil && len(pathJ1ToEnd.StationIDs) >= 2 {
				revShortcut := reverseSlice(rule.ShortcutPath)
				cand := append([]int(nil), revShortcut...)
				cand = append(cand, pathJ1ToEnd.StationIDs[1:]...)
				cands = append(cands, cand)
			}
		}

		if endOnDetour {
			// Option A: J1 から退出
			pathStartToJ1, err := g.FindShortestPathGisei(start, rule.ShortcutPath[0])
			if err == nil && len(pathStartToJ1.StationIDs) >= 2 {
				cand := append([]int(nil), pathStartToJ1.StationIDs...)
				cand = append(cand, rule.ShortcutPath[1:]...)
				cands = append(cands, cand)
			}

			// Option B: J2 から退出
			pathStartToJ2, err := g.FindShortestPathGisei(start, rule.ShortcutPath[len(rule.ShortcutPath)-1])
			if err == nil && len(pathStartToJ2.StationIDs) >= 2 {
				revShortcut := reverseSlice(rule.ShortcutPath)
				cand := append([]int(nil), pathStartToJ2.StationIDs...)
				cand = append(cand, revShortcut[1:]...)
				cands = append(cands, cand)
			}
		}
	}

	minFare := math.MaxInt
	for _, cand := range cands {
		if !checkMixedRouteConflictPrecompute(rules, cand) {
			continue
		}
		res, err := calc.Execute(cand, months)
		if err != nil {
			continue
		}
		amt := res.TotalAmount()
		if amt < minFare {
			minFare = amt
		}
	}

	if minFare == math.MaxInt {
		return 0
	}
	return minFare
}

func checkMixedRouteConflictPrecompute(rules []passdomain.ResolvedBypassRule, path []int) bool {
	pathSet := make(map[int]bool, len(path))
	for _, sid := range path {
		pathSet[sid] = true
	}

	for _, rule := range rules {
		hasShortcutInner := false
		if len(rule.ShortcutPath) > 2 {
			for i := 1; i < len(rule.ShortcutPath)-1; i++ {
				if pathSet[rule.ShortcutPath[i]] {
					hasShortcutInner = true
					break
				}
			}
		}

		if !hasShortcutInner {
			continue
		}

		hasAllDetour := true
		for _, detID := range rule.DetourPath {
			if !pathSet[detID] {
				hasAllDetour = false
				break
			}
		}

		if hasShortcutInner && hasAllDetour {
			return false
		}
	}
	return true
}

func reconstructPath(prev []int, start, end int) []int {
	if prev == nil || end < 0 || end >= len(prev) || prev[end] == -1 {
		if start == end {
			return []int{start}
		}
		return nil
	}
	path := []int{}
	for i := end; i != -1; i = prev[i] {
		path = append(path, i)
	}
	for i, j := 0, len(path)-1; i < j; i, j = i+1, j-1 {
		path[i], path[j] = path[j], path[i]
	}
	return path
}

func containsStation(path []int, stationID int) bool {
	for _, id := range path {
		if id == stationID {
			return true
		}
	}
	return false
}

func isOnDetourMiddle(stationID int, rule passdomain.ResolvedBypassRule) bool {
	for i := 1; i < len(rule.DetourPath)-1; i++ {
		if rule.DetourPath[i] == stationID {
			return true
		}
	}
	return false
}
