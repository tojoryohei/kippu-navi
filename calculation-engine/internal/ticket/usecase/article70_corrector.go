package usecase

import (
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/graph"
)

type Article70Corrector struct {
	article70Routes *ticketdomain.Article70Routes
}

func NewArticle70Corrector(routes *ticketdomain.Article70Routes) *Article70Corrector {
	return &Article70Corrector{article70Routes: routes}
}

// Article70Corrector は70条特例エリア（大都市近郊区間・太線区間）を通過または発着する際に、最短経路へ補正します。
func (u *Article70Corrector) Correct(path []int, g graph.Graph) ([]int, error) {
	if u.article70Routes == nil || len(path) < 2 {
		return path, nil
	}

	// 太線セグメントを抽出
	type segment struct {
		startIdx int
		endIdx   int
	}
	var segments []segment

	inSegment := false
	startIdx := 0

	for i := 0; i < len(path)-1; i++ {
		edges := g.GetEdges(path[i])
		var isBold bool
		for _, e := range edges {
			if e.ToID == path[i+1] && e.IsBoldLineArea {
				isBold = true
				break
			}
		}

		if isBold {
			if !inSegment {
				inSegment = true
				startIdx = i
			}
		} else {
			if inSegment {
				inSegment = false
				segments = append(segments, segment{startIdx, i})
			}
		}
	}
	if inSegment {
		segments = append(segments, segment{startIdx, len(path) - 1})
	}

	if len(segments) == 0 {
		return path, nil
	}

	// 経路置換のために新しいスライスを作成（後ろから処理するとインデックスが狂いにくい）
	newPath := make([]int, len(path))
	copy(newPath, path)

	for i := len(segments) - 1; i >= 0; i-- {
		seg := segments[i]

		// エリア内完結（最初から最後まで）は補正しないルール
		if seg.startIdx == 0 && seg.endIdx == len(path)-1 {
			continue
		}

		mode := "passing"
		if seg.startIdx == 0 {
			mode = "from"
		} else if seg.endIdx == len(path)-1 {
			mode = "to"
		}

		startName := g.GetName(path[seg.startIdx])
		endName := g.GetName(path[seg.endIdx])

		routeNames := u.article70Routes.GetRoute(mode, startName, endName)
		if routeNames != nil {
			var routeIDs []int
			for _, name := range routeNames {
				if id, ok := g.GetID(name); ok {
					routeIDs = append(routeIDs, id)
				} else {
					routeIDs = nil
					break
				}
			}

			if len(routeIDs) > 0 {
				if routeIDs[0] != path[seg.startIdx] {
					routeIDs = append([]int{path[seg.startIdx]}, routeIDs...)
				}
				if routeIDs[len(routeIDs)-1] != path[seg.endIdx] {
					routeIDs = append(routeIDs, path[seg.endIdx])
				}
				head := newPath[:seg.startIdx]
				tail := newPath[seg.endIdx+1:]
				merged := make([]int, 0, len(head)+len(routeIDs)+len(tail))
				merged = append(merged, head...)
				merged = append(merged, routeIDs...)
				merged = append(merged, tail...)
				newPath = merged
			}
		}
	}

	return newPath, nil
}
