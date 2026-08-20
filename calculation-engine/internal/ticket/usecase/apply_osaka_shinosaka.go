package usecase

import (
	"calculation-engine/internal/ticket/graph"
)

func isHimejiBeyondStation(name string) bool {
	switch name {
	case "手柄山平和公園", "京口", "播磨高岡", "相生":
		return true
	default:
		return false
	}
}

// ApplyOsakaShinOsakaException は旅客営業規則第88条（大阪・新大阪と姫路以遠間の特例）を適用します。
// 経路内に「姫路」が含まれており、かつ発着駅が「大阪」または「新大阪」の場合、仮想駅「大阪・新大阪」に置換します。
func ApplyOsakaShinOsakaException(path []int, g graph.Graph) (*AppliedZoneInfo, bool) {
	if len(path) < 2 {
		return nil, false
	}

	himejiIdx := -1
	for i, id := range path {
		if g.GetName(id) == "姫路" {
			himejiIdx = i
			break
		}
	}

	if himejiIdx == -1 {
		return nil, false
	}

	originName := g.GetName(path[0])
	destName := g.GetName(path[len(path)-1])

	originMatch := originName == "大阪" || originName == "新大阪"
	destMatch := destName == "大阪" || destName == "新大阪"

	if !originMatch && !destMatch {
		return nil, false
	}
	if originMatch && destMatch {
		return nil, false
	}

	validDirection := false
	if originMatch {
		if himejiIdx == len(path)-1 {
			validDirection = true
		} else {
			nextName := g.GetName(path[himejiIdx+1])
			validDirection = isHimejiBeyondStation(nextName)
		}
	} else if destMatch {
		if himejiIdx == 0 {
			validDirection = true
		} else {
			prevName := g.GetName(path[himejiIdx-1])
			validDirection = isHimejiBeyondStation(prevName)
		}
	}

	if !validDirection {
		return nil, false
	}

	zoneID, ok := g.GetID("大阪・新大阪")
	if !ok {
		return nil, false
	}

	newPath := make([]int, 0, len(path))

	firstNonBoundary := 0
	for i := 0; i < len(path); i++ {
		name := g.GetName(path[i])
		if name != "大阪" && name != "新大阪" {
			firstNonBoundary = i
			break
		}
	}

	lastNonBoundary := len(path) - 1
	for i := len(path) - 1; i >= 0; i-- {
		name := g.GetName(path[i])
		if name != "大阪" && name != "新大阪" {
			lastNonBoundary = i
			break
		}
	}

	applied := false

	if originMatch {
		newPath = append(newPath, zoneID)
		newPath = append(newPath, path[firstNonBoundary:lastNonBoundary+1]...)
		applied = true
	} else {
		newPath = append(newPath, path[0:lastNonBoundary+1]...)
	}

	if destMatch {
		if !originMatch {
			// newPath already contains up to lastNonBoundary
			newPath = append(newPath, zoneID)
		} else {
			// we already appended [firstNonBoundary:lastNonBoundary+1]
			newPath = append(newPath, zoneID)
		}
		applied = true
	}

	if applied {
		return &AppliedZoneInfo{
			TransformedPath: newPath,
			ThresholdKilo:   0,
		}, true
	}

	return nil, false
}
