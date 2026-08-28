package domain

import "calculation-engine/internal/domain"

// PassEdge は定期券計算で用いられる駅間データ構造です。
type PassEdge struct {
	domain.Edge
	IsIcPassArea  bool
	IsBoldLineArea bool
}
