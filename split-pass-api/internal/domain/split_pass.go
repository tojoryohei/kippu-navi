package domain

// SplitPassRequest は分割乗車券計算のリクエストペイロードです
type SplitPassRequest struct {
	OriginID      string `json:"origin_id"`
	DestinationID string `json:"destination_id"`
}

// SplitPassResponse は分割乗車券計算の結果です
type SplitPassResponse struct {
	TotalCost int       `json:"total_cost"`
	Path      []Station `json:"path"` // 順番に並んだ駅のIDと名前
}
