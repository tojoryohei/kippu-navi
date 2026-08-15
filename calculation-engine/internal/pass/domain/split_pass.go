package domain

import cDomain "calculation-engine/internal/domain"

// SplitPassRequest は分割乗車券計算のリクエストペイロードです
type SplitPassRequest struct {
	OriginID      string
	DestinationID string
}

// SplitPassResponse は分割乗車券計算の結果です
type SplitPassResponse struct {
	TotalCost int
	Path      []cDomain.Station // 順番に並んだ駅のIDと名前
}
