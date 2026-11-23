package domain

// HasDuplicateStation は、発売不可となる駅重複があるかを判定します。
//
// 環状線や6の字経路では、終着駅が経路中の駅と一致することがあります。
// そのため終着駅を除いた部分だけを重複チェックし、終着駅については
// 最後から3番目の駅との一致だけを重複として扱います。特例補正前の
// 入力経路を検証するため、駅ID列だけを受け取る独立した関数にしています。
func HasDuplicateStation(path []int) bool {
	return HasDuplicateStationExcept(path, nil)
}

// HasDuplicateStationExcept は除外された出現箇所を重複判定から外します。
func HasDuplicateStationExcept(path []int, excluded func(int) bool) bool {
	if len(path) < 2 {
		return false
	}

	seen := make(map[int]struct{}, len(path)-1)
	for i, stationID := range path[:len(path)-1] {
		if excluded != nil && excluded(i) {
			continue
		}
		if _, exists := seen[stationID]; exists {
			return true
		}
		seen[stationID] = struct{}{}
	}

	if len(path) >= 3 && path[len(path)-1] == path[len(path)-3] &&
		(excluded == nil || !excluded(len(path)-3)) {
		return true
	}

	return false
}

// PrivateInteriorStation は、経路上で前後とも私鉄を利用する途中駅を判定します。
// 経路の両端とJR・私鉄の接続駅は除外しません。
func PrivateInteriorStation(path []int, i int, isPrivateEdge func(int, int) bool) bool {
	return i > 0 && i+1 < len(path) &&
		isPrivateEdge(path[i-1], path[i]) && isPrivateEdge(path[i], path[i+1])
}

// HasDuplicateStationOnMixedRoute は、私鉄区間内の重複と、私鉄の途中駅を
// 除いた経路の重複を判定します。接続駅は両方の判定に含みます。
func HasDuplicateStationOnMixedRoute(path []int, isPrivateEdge func(int, int) bool) bool {
	if len(path) < 2 {
		return false
	}

	privateEdges := make([]bool, len(path)-1)
	var privateStations map[int]struct{}
	for i, from := range path[:len(path)-1] {
		to := path[i+1]
		if !isPrivateEdge(from, to) {
			continue
		}
		privateEdges[i] = true
		if i == 0 || !privateEdges[i-1] {
			privateStations = map[int]struct{}{from: {}}
		}
		if _, duplicate := privateStations[to]; duplicate {
			return true
		}
		privateStations[to] = struct{}{}
	}

	return HasDuplicateStationExcept(path, func(i int) bool {
		return i > 0 && i < len(privateEdges) && privateEdges[i-1] && privateEdges[i]
	})
}
