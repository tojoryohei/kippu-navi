package usecase

import "calculation-engine/internal/domain"

func (c *RoutePassCalculator) CorrectPath(path []int) []int {
	for _, rule := range c.rules {
		if index, ok := findSubslice(path, rule.DetourPath); ok {
			if !hasAnyInnerShortcut(path, rule.ShortcutPath) {
				path, _ = replaceSubsliceAt(path, index, len(rule.DetourPath), rule.ShortcutPath)
			}
		} else if index, ok := findSubslice(path, reverseSlice(rule.DetourPath)); ok {
			if !hasAnyInnerShortcut(path, rule.ShortcutPath) {
				path, _ = replaceSubsliceAt(path, index, len(rule.DetourPath), reverseSlice(rule.ShortcutPath))
			}
		}
	}
	return path
}

func findSubslice(slice []int, target []int) (int, bool) {
	n := len(slice)
	m := len(target)
	if m == 0 || n < m {
		return -1, false
	}
	for i := 0; i <= n-m; i++ {
		match := true
		for j := 0; j < m; j++ {
			if slice[i+j] != target[j] {
				match = false
				break
			}
		}
		if match {
			return i, true
		}
	}
	return -1, false
}

func replaceSubsliceAt(slice []int, start, length int, newSeq []int) ([]int, bool) {
	res := make([]int, 0, len(slice)-length+len(newSeq))
	res = append(res, slice[:start]...)
	res = append(res, newSeq...)
	res = append(res, slice[start+length:]...)
	return res, true
}

func hasAnyInnerShortcut(path []int, shortcut []int) bool {
	inner := shortcut[1 : len(shortcut)-1]
	for _, sID := range inner {
		for _, pID := range path {
			if sID == pID {
				return true
			}
		}
	}
	return false
}

func (c *RoutePassCalculator) cheapestCandidates(path []int) [][]int {
	normalPath := c.CorrectPath(path)

	start := path[0]
	end := path[len(path)-1]

	var startExtensions [][]int
	for _, rule := range c.rules {
		if isStationInMiddle(start, rule.ShortcutPath) {
			p1 := getSubpathOnRule(rule.ShortcutPath, rule.ShortcutPath[0], start)
			startExtensions = append(startExtensions, p1)
			p2 := getSubpathOnRule(rule.ShortcutPath, rule.ShortcutPath[len(rule.ShortcutPath)-1], start)
			startExtensions = append(startExtensions, p2)
		}
		if isStationInMiddle(start, rule.DetourPath) {
			p1 := getSubpathOnRule(rule.DetourPath, rule.DetourPath[0], start)
			startExtensions = append(startExtensions, p1)
			p2 := getSubpathOnRule(rule.DetourPath, rule.DetourPath[len(rule.DetourPath)-1], start)
			startExtensions = append(startExtensions, p2)
		}
	}

	var endExtensions [][]int
	for _, rule := range c.rules {
		if isStationInMiddle(end, rule.ShortcutPath) {
			p1 := getSubpathOnRule(rule.ShortcutPath, end, rule.ShortcutPath[0])
			endExtensions = append(endExtensions, p1)
			p2 := getSubpathOnRule(rule.ShortcutPath, end, rule.ShortcutPath[len(rule.ShortcutPath)-1])
			endExtensions = append(endExtensions, p2)
		}
		if isStationInMiddle(end, rule.DetourPath) {
			p1 := getSubpathOnRule(rule.DetourPath, end, rule.DetourPath[0])
			endExtensions = append(endExtensions, p1)
			p2 := getSubpathOnRule(rule.DetourPath, end, rule.DetourPath[len(rule.DetourPath)-1])
			endExtensions = append(endExtensions, p2)
		}
	}

	var basePaths [][]int
	basePaths = append(basePaths, normalPath)

	for _, ext := range startExtensions {
		if len(ext) > 1 {
			cand := append([]int(nil), ext...)
			cand = append(cand, normalPath[1:]...)
			basePaths = append(basePaths, cand)
		}
	}

	var finalCandidates [][]int
	finalCandidates = append(finalCandidates, basePaths...)
	for _, bp := range basePaths {
		for _, ext := range endExtensions {
			if len(ext) > 1 {
				cand := append([]int(nil), bp...)
				cand = append(cand, ext[1:]...)
				finalCandidates = append(finalCandidates, cand)
			}
		}
	}

	var finalCorrected [][]int
	for _, cand := range finalCandidates {
		corr := c.CorrectPath(cand)
		if !containsPath(finalCorrected, corr) {
			finalCorrected = append(finalCorrected, corr)
		}
	}

	return finalCorrected
}

func isStationInMiddle(stationID int, rulePath []int) bool {
	if len(rulePath) < 3 {
		return false
	}
	for i := 1; i < len(rulePath)-1; i++ {
		if rulePath[i] == stationID {
			return true
		}
	}
	return false
}

func getSubpathOnRule(rulePath []int, from, to int) []int {
	fromIdx := -1
	toIdx := -1
	for i, id := range rulePath {
		if id == from {
			fromIdx = i
		}
		if id == to {
			toIdx = i
		}
	}
	if fromIdx == -1 || toIdx == -1 {
		return nil
	}

	if fromIdx < toIdx {
		res := make([]int, toIdx-fromIdx+1)
		copy(res, rulePath[fromIdx:toIdx+1])
		return res
	} else {
		res := make([]int, fromIdx-toIdx+1)
		for i := 0; i < len(res); i++ {
			res[i] = rulePath[fromIdx-i]
		}
		return res
	}
}

func validRoutePassCandidate(path []int) bool {
	return len(path) >= 2 && !domain.HasDuplicateStation(path)
}
