package domain

// HasDuplicateStation は、発売不可となる駅重複があるかを判定します。
//
// 環状線や6の字経路では、終着駅が経路中の駅と一致することがあります。
// そのため終着駅を除いた部分だけを重複チェックし、終着駅については
// 最後から3番目の駅との一致だけを重複として扱います。特例補正前の
// 入力経路を検証するため、駅ID列だけを受け取る独立した関数にしています。
func HasDuplicateStation(path []int) bool {
	if len(path) < 2 {
		return false
	}

	seen := make(map[int]struct{}, len(path)-1)
	for _, stationID := range path[:len(path)-1] {
		if _, exists := seen[stationID]; exists {
			return true
		}
		seen[stationID] = struct{}{}
	}

	if len(path) >= 3 && path[len(path)-1] == path[len(path)-3] {
		return true
	}

	return false
}
