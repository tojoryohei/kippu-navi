package usecase

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"strconv"
	"strings"
)

// RouteSegment は分割計算に渡す1つの区間と分割禁止情報を保持します。
type RouteSegment struct {
	Path   []int
	Locked []bool // true の駅インデックスでは分割を禁止する
}

// EvaluationTask は1つの候補経路から展開された評価単位です。
type EvaluationTask struct {
	Segments []RouteSegment
}

// SearchOptimalSplit は候補経路の探索・補正・分割最適化を統括するユースケースです。
type SearchOptimalSplit struct {
	graph *graph.Graph
	split *FindOptimalSplit
	rules []domain.ResolvedBypassRule
}

// NewSearchOptimalSplit は新しい SearchOptimalSplit を作成します。
func NewSearchOptimalSplit(g *graph.Graph, u *FindOptimalSplit, rules []domain.ResolvedBypassRule) *SearchOptimalSplit {
	// サーバー起動時に1回だけ、衝突のない安全な双方向ルールを生成・保持する
	return &SearchOptimalSplit{
		graph: g,
		split: u,
		rules: makeUniqueBidirectionalRules(rules),
	}
}

// OptimalSearchResult は探索結果全体（通常運賃と最適分割運賃）を保持します。
type OptimalSearchResult struct {
	Normal   SplitResult   // 分割なしの最安結果
	Optimals []SplitResult // 分割時の最安結果
}

func (u *SearchOptimalSplit) Execute(startID, endID, months int) (*OptimalSearchResult, error) {
	shortest, err := u.graph.FindShortestPathGisei(startID, endID)
	if err != nil {
		return nil, fmt.Errorf("searchOptimalSplit: 最短経路の検索に失敗: %w", err)
	}

	if len(shortest.StationIDs) > 100 {
		return nil, fmt.Errorf("searchOptimalSplit: 発着駅間の駅数(%d)が上限の100を超えています。", len(shortest.StationIDs))
	}

	calcResult, err := u.split.calc.Execute(shortest.StationIDs, months)
	if err != nil {
		return nil, fmt.Errorf("searchOptimalSplit: 最短経路の運賃計算に失敗: %w", err)
	}

	var cheapestAmountPerDecikilo float64
	kyotoID, kyotoExists := u.graph.NameToID["京都"]
	osakaID, osakaExists := u.graph.NameToID["大阪"]

	if kyotoExists && osakaExists {
		kyotoToOsakaPath, err := u.graph.FindShortestPathGisei(kyotoID, osakaID)
		if err != nil {
			return nil, fmt.Errorf("searchOptimalSplit: 京都 -> 大阪の探索に失敗: %w", err)
		}

		kyotoToOsakaAmount, err := u.split.calc.Execute(kyotoToOsakaPath.StationIDs, months)
		if err != nil {
			return nil, fmt.Errorf("searchOptimalSplit: 京都 -> 大阪の運賃計算に失敗: %w", err)
		}
		cheapestAmountPerDecikilo = float64(kyotoToOsakaAmount.TotalAmount()) / float64(kyotoToOsakaPath.EigyoKilo)
	} else if months == 1 {
		cheapestAmountPerDecikilo = 45780.0 / 100.0
	} else if months == 3 {
		cheapestAmountPerDecikilo = 130540.0 / 100.0
	} else {
		cheapestAmountPerDecikilo = 236070.0 / 100.0
	}

	normalFare := calcResult.TotalAmount()

	maxGisei := domain.DeciKilo(float64(normalFare) / cheapestAmountPerDecikilo)
	if maxGisei < shortest.GiseiKilo {
		maxGisei = shortest.GiseiKilo
	}

	candidatePathResults, err := u.graph.FindAllCandidatePaths(startID, endID, maxGisei)
	if err != nil {
		return nil, fmt.Errorf("searchOptimalSplit: 候補経路の検索に失敗: %w", err)
	}

	paths := make([][]int, len(candidatePathResults))
	for i, pr := range candidatePathResults {
		paths[i] = pr.StationIDs
	}

	tasks := u.generateTasks(paths, u.rules)

	allPatterns, err := u.evaluateTasks(tasks, months)
	if err != nil {
		return nil, err
	}

	normalResult := SplitResult{
		TotalAmount: normalFare,
		Segments: []SplitSegment{
			{
				Path:   shortest.StationIDs,
				Result: calcResult,
			},
		},
	}

	return &OptimalSearchResult{
		Normal:   normalResult,
		Optimals: u.filterGlobalOptimal(allPatterns),
	}, nil
}

func (u *SearchOptimalSplit) generateTasks(paths [][]int, rules []domain.ResolvedBypassRule) []EvaluationTask {
	var tasks []EvaluationTask

	for _, path := range paths {
		locked := make([]bool, len(path))
		isBranch1 := false

		for _, rule := range rules {
			startIdx, _ := u.findSubPath(path, rule.DetourPath)
			startOnDetour := u.isOnDetourMiddle(path[0], rule)
			endOnDetour := u.isOnDetourMiddle(path[len(path)-1], rule)

			// 削除されていた分岐駅の存在チェックを復元
			jStart := rule.ShortcutPath[0]
			jEnd := rule.ShortcutPath[len(rule.ShortcutPath)-1]
			idxStart := u.indexOf(path, jStart)
			idxEnd := u.indexOf(path, jEnd)
			containsBothJunctions := (idxStart != -1 && idxEnd != -1)

			// 進行方向の検証。経路の進行方向とルールの方向が一致していない場合は、逆方向ルールに任せる
			if containsBothJunctions && idxStart > idxEnd {
				continue
			}

			// 分岐1: 経路全体が近道と遠回りのみで構成され、かつ両分岐駅を通る場合
			if (startOnDetour || endOnDetour) && u.isEntirelyOnRule(path, rule) {
				shortcutPath := make([]int, len(rule.ShortcutPath))
				copy(shortcutPath, rule.ShortcutPath)

				tasks = append(tasks, EvaluationTask{
					Segments: []RouteSegment{
						{Path: shortcutPath, Locked: makeShortcutLocked(shortcutPath)},
					},
				})
				isBranch1 = true
				break
			}

			// 分岐2: 発着駅が遠回り上にあるが、完全に内包(startIdx!=-1)されていない場合
			if (startOnDetour || endOnDetour) && startIdx == -1 {
				extPath, extLocked := u.buildOvershootPath(path, locked, rule)
				if extPath != nil {
					segmentsCombos := u.expandPath(extPath, extLocked, rules)
					for _, segments := range segmentsCombos {
						tasks = append(tasks, EvaluationTask{Segments: segments})
					}
				}
			}
		}

		if isBranch1 {
			tasks = append(tasks, EvaluationTask{
				Segments: []RouteSegment{{Path: path, Locked: locked}},
			})
			continue
		}

		// 全候補共通:
		segmentsCombos := u.expandPath(path, locked, rules)
		for _, segments := range segmentsCombos {
			tasks = append(tasks, EvaluationTask{Segments: segments})
		}
	}

	return tasks
}

// buildOvershootPath は発着駅が遠回り上にある場合、分岐駅まで延長した経路と locked を生成します（分岐2用）。
func (u *SearchOptimalSplit) buildOvershootPath(path []int, locked []bool, rule domain.ResolvedBypassRule) ([]int, []bool) {
	// 始点のオーバーシュート判定
	for i := 1; i < len(rule.DetourPath)-1; i++ {
		suffix := rule.DetourPath[i:]
		if len(path) >= len(suffix) && u.isMatch(path[:len(suffix)], suffix) {
			newPath := make([]int, 0, len(rule.ShortcutPath)+len(path)-len(suffix))
			newLocked := make([]bool, 0, cap(newPath))

			newPath = append(newPath, rule.ShortcutPath...)
			newLocked = append(newLocked, makeShortcutLocked(rule.ShortcutPath)...)

			newPath = append(newPath, path[len(suffix):]...)
			newLocked = append(newLocked, locked[len(suffix):]...)

			return newPath, newLocked
		}
	}

	// 終点のオーバーシュート判定
	for i := 1; i < len(rule.DetourPath)-1; i++ {
		prefix := rule.DetourPath[:i+1]
		if len(path) >= len(prefix) {
			startMatchIdx := len(path) - len(prefix)
			if u.isMatch(path[startMatchIdx:], prefix) {
				newPath := make([]int, 0, startMatchIdx+len(rule.ShortcutPath))
				newLocked := make([]bool, 0, cap(newPath))

				newPath = append(newPath, path[:startMatchIdx]...)
				newLocked = append(newLocked, locked[:startMatchIdx]...)

				newPath = append(newPath, rule.ShortcutPath...)
				newLocked = append(newLocked, makeShortcutLocked(rule.ShortcutPath)...)

				return newPath, newLocked
			}
		}
	}

	return nil, nil
}

// expandPath は経路内の遠回り区間を再帰的に展開し、強制分割の全組み合わせを返します（分岐2用）。
func (u *SearchOptimalSplit) expandPath(path []int, locked []bool, rules []domain.ResolvedBypassRule) [][]RouteSegment {
	for _, rule := range rules {
		startIdx, _ := u.findSubPath(path, rule.DetourPath)
		if startIdx == -1 {
			continue
		}

		detourMiddleCount := len(rule.DetourPath) - 2
		if detourMiddleCount <= 0 {
			continue
		}

		var results [][]RouteSegment

		splitCandidates := make([]int, detourMiddleCount)
		for i := range splitCandidates {
			splitCandidates[i] = startIdx + 1 + i
		}
		sort.Ints(splitCandidates)

		for _, splitIdx := range splitCandidates {
			leftPath := make([]int, splitIdx+1)
			copy(leftPath, path[:splitIdx+1])
			leftLocked := make([]bool, splitIdx+1)
			copy(leftLocked, locked[:splitIdx+1])

			rightPath := make([]int, len(path)-splitIdx)
			copy(rightPath, path[splitIdx:])
			rightLocked := make([]bool, len(path)-splitIdx)
			copy(rightLocked, locked[splitIdx:])

			leftExpanded := u.expandPath(leftPath, leftLocked, rules)
			rightExpanded := u.expandPath(rightPath, rightLocked, rules)

			for _, l := range leftExpanded {
				for _, r := range rightExpanded {
					combined := make([]RouteSegment, 0, len(l)+len(r))
					combined = append(combined, l...)
					combined = append(combined, r...)
					results = append(results, combined)
				}
			}
		}

		return results
	}

	return [][]RouteSegment{{{Path: path, Locked: locked}}}
}

func (u *SearchOptimalSplit) evaluateTasks(tasks []EvaluationTask, months int) ([]SplitResult, error) {
	var allPatterns []SplitResult

	for _, task := range tasks {
		var taskTotalAmount int
		var taskSegments []SplitSegment
		isValidTask := true

		for _, seg := range task.Segments {
			results, err := u.split.Execute(seg.Path, months, seg.Locked)
			if err != nil {
				if errors.Is(err, domain.ErrInvalidPath) {
				isValidTask = false
				break
				}
				return nil, fmt.Errorf("evaluateTasks: %w", err)
			}
			bestForSeg := results[0]
			taskTotalAmount += bestForSeg.TotalAmount
			taskSegments = append(taskSegments, bestForSeg.Segments...)
		}

		if isValidTask {
			allPatterns = append(allPatterns, SplitResult{
				TotalAmount: taskTotalAmount,
				Segments:    taskSegments,
			})
		}
	}

	if len(allPatterns) == 0 {
		return nil, fmt.Errorf("searchOptimalSplit: %w", domain.ErrNoValidPattern)
	}
	return allPatterns, nil
}

func (u *SearchOptimalSplit) filterGlobalOptimal(patterns []SplitResult) []SplitResult {
	if len(patterns) == 0 {
		return nil
	}
	minAmount := math.MaxInt
	for _, p := range patterns {
		if p.TotalAmount < minAmount {
			minAmount = p.TotalAmount
		}
	}
	var optimalPatterns []SplitResult
	for _, p := range patterns {
		if p.TotalAmount == minAmount {
			optimalPatterns = append(optimalPatterns, p)
		}
	}
	return optimalPatterns
}

// isEntirelyOnRule は経路の全駅が特例の近道・遠回りのいずれかに含まれているかを判定します（分岐1用）。
func (u *SearchOptimalSplit) isEntirelyOnRule(path []int, rule domain.ResolvedBypassRule) bool {
	for _, stationID := range path {
		if !u.containsStation(rule.ShortcutPath, stationID) && !u.containsStation(rule.DetourPath, stationID) {
			return false
		}
	}
	return true
}

// isOnDetourMiddle は駅IDが遠回りルールの中間駅（分岐駅を除く）に含まれるかを返します。
func (u *SearchOptimalSplit) isOnDetourMiddle(stationID int, rule domain.ResolvedBypassRule) bool {
	for i := 1; i < len(rule.DetourPath)-1; i++ {
		if rule.DetourPath[i] == stationID {
			return true
		}
	}
	return false
}

// containsStation は経路内に指定の駅IDが含まれるかを返します。
func (u *SearchOptimalSplit) containsStation(path []int, stationID int) bool {
	for _, id := range path {
		if id == stationID {
			return true
		}
	}
	return false
}

// indexOf はスライス内の要素のインデックスを返します。見つからない場合は -1 を返します。
func (u *SearchOptimalSplit) indexOf(path []int, stationID int) int {
	for i, id := range path {
		if id == stationID {
			return i
		}
	}
	return -1
}

// makeShortcutLocked は近道ルートの駅をロック状態に設定する純粋関数です。
func makeShortcutLocked(shortcutPath []int) []bool {
	locked := make([]bool, len(shortcutPath))
	for k := 1; k < len(shortcutPath)-1; k++ {
		locked[k] = true
	}
	return locked
}

// findSubPath は2つのスライス間の部分一致を検索し、開始インデックスと終了インデックスを返します。見つからない場合は (-1, -1) を返します。
func (u *SearchOptimalSplit) findSubPath(a, b []int) (int, int) {
	if len(b) == 0 || len(a) < len(b) {
		return -1, -1
	}
	for i := 0; i <= len(a)-len(b); i++ {
		if u.isMatch(a[i:i+len(b)], b) {
			return i, i + len(b) - 1
		}
	}
	return -1, -1
}

func (u *SearchOptimalSplit) isMatch(a, b []int) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

// makeUniqueBidirectionalRules は双方向ルールを生成しつつ、重複を完全に排除する純粋関数です。
func makeUniqueBidirectionalRules(rules []domain.ResolvedBypassRule) []domain.ResolvedBypassRule {
	var biRules []domain.ResolvedBypassRule
	seen := make(map[string]bool)

	for _, r := range rules {
		// 順方向
		fwdKey := generateRuleKey(r.ShortcutPath, r.DetourPath)
		if !seen[fwdKey] {
			seen[fwdKey] = true
			biRules = append(biRules, r)
		}

		// 逆方向
		revShortcut := reverseSlice(r.ShortcutPath)
		revDetour := reverseSlice(r.DetourPath)
		revKey := generateRuleKey(revShortcut, revDetour)

		if !seen[revKey] {
			seen[revKey] = true
			biRules = append(biRules, domain.ResolvedBypassRule{
				ShortcutPath: revShortcut,
				DetourPath:   revDetour,
			})
		}
	}
	return biRules
}

// generateRuleKey は衝突を防ぐための安全なキー生成関数です。
func generateRuleKey(shortcut, detour []int) string {
	var sb strings.Builder
	sb.Grow((len(shortcut) + len(detour)) * 5)

	// スタック上に一時バッファを確保（64bit整数の最大桁数20バイトで十分）
	// ※ヒープではなくスタックに置かれるためアロケーションコストはゼロです
	var buf [20]byte

	for i, id := range shortcut {
		if i > 0 {
			sb.WriteByte(',')
		}
		// buf[:0]（容量20の空スライス）に数値を文字データとして追記
		b := strconv.AppendInt(buf[:0], int64(id), 10)
		sb.Write(b) // Builderの内部バッファへ直接コピー（文字列化を経由しない）
	}

	sb.WriteByte('|')

	for i, id := range detour {
		if i > 0 {
			sb.WriteByte(',')
		}
		b := strconv.AppendInt(buf[:0], int64(id), 10)
		sb.Write(b)
	}

	return sb.String()
}

// reverseSlice はスライスを反転する純粋関数です。
func reverseSlice(s []int) []int {
	res := make([]int, len(s))
	for i, v := range s {
		res[len(s)-1-i] = v
	}
	return res
}
