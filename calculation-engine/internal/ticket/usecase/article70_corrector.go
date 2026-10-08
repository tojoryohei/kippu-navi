package usecase

import (
	"calculation-engine/internal/domain"
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
	return u.correctWithSource(path, path, g)
}

func (u *Article70Corrector) correctWithSource(path, source []int, g graph.Graph) ([]int, error) {
	if u.article70Routes == nil || len(path) < 2 {
		return path, nil
	}

	segments := article70Segments(path, g)
	if len(segments) == 0 {
		return path, nil
	}

	// 経路置換のために新しいスライスを作成（後ろから処理するとインデックスが狂いにくい）
	newPath := make([]int, len(path))
	copy(newPath, path)
	correctedEndpoint := false

	for i := len(segments) - 1; i >= 0; i-- {
		seg := segments[i]

		// エリア内完結（最初から最後まで）は補正しないルール
		if seg.start == 0 && seg.end == len(path)-1 {
			continue
		}

		mode := "passing"
		if seg.start == 0 {
			mode = "from"
		} else if seg.end == len(path)-1 {
			mode = "to"
		}

		startName := g.GetName(path[seg.start])
		endName := g.GetName(path[seg.end])

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
				if routeIDs[0] != path[seg.start] {
					routeIDs = append([]int{path[seg.start]}, routeIDs...)
				}
				if routeIDs[len(routeIDs)-1] != path[seg.end] {
					routeIDs = append(routeIDs, path[seg.end])
				}
				head := newPath[:seg.start]
				tail := newPath[seg.end+1:]
				merged := make([]int, 0, len(head)+len(routeIDs)+len(tail))
				merged = append(merged, head...)
				merged = append(merged, routeIDs...)
				merged = append(merged, tail...)
				newPath = merged
				correctedEndpoint = correctedEndpoint || mode != "passing"
			}
		}
	}

	// 第160条のう回乗車と要求区間の整合を確認する。東京〜上野だけを
	// 新幹線で利用する場合に限定し、上野〜大宮も新幹線なら対象外とする。
	// 判定は第70条補正直後に行い、最安モードの経路延長より前に返す。
	if correctedEndpoint && requiresTokyoUenoShinkansen(source, g) &&
		!containsStationSequence(newPath, g, "東京", "上野") &&
		!containsStationSequence(newPath, g, "東京", "神田", "秋葉原", "御徒町", "上野") {
		return nil, domain.ErrRequestedSection
	}
	return newPath, nil
}

type article70Segment struct{ start, end int }

// 補正と印字は同じエッジ属性で太線区間を判定する。
// 東京〜上野の新幹線も shinkansen_edges.json の IsBoldLineArea に従う。
func article70Segments(path []int, g graph.Graph) []article70Segment {
	var segments []article70Segment
	start := -1
	for i := 0; i+1 < len(path); i++ {
		bold := false
		if path[i] >= 0 && path[i+1] >= 0 {
			for _, edge := range g.GetEdges(path[i]) {
				if edge.ToID == path[i+1] && edge.IsBoldLineArea {
					bold = true
					break
				}
			}
		}
		if bold && start < 0 {
			start = i
		} else if !bold && start >= 0 {
			segments = append(segments, article70Segment{start, i})
			start = -1
		}
	}
	if start >= 0 {
		segments = append(segments, article70Segment{start, len(path) - 1})
	}
	return segments
}

func requiresTokyoUenoShinkansen(source []int, g graph.Graph) bool {
	if containsStationSequence(source, g, "上野", "大宮") {
		return false
	}
	for _, segment := range article70Segments(source, g) {
		// エリア内完結と通過は今回の要求区間判定の対象外。
		if (segment.start == 0) == (segment.end == len(source)-1) {
			continue
		}
		if containsStationSequence(source[segment.start:segment.end+1], g, "東京", "上野") {
			return true
		}
	}
	return false
}

func containsStationSequence(path []int, g graph.StationProvider, names ...string) bool {
	for i := 0; i+len(names) <= len(path); i++ {
		forward, reverse := true, true
		for j, name := range names {
			forward = forward && g.GetName(path[i+j]) == name
			reverse = reverse && g.GetName(path[i+j]) == names[len(names)-1-j]
		}
		if forward || reverse {
			return true
		}
	}
	return false
}
