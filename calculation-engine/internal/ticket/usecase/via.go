package usecase

import "calculation-engine/internal/ticket/graph"

// GetVia は経路中の分岐駅の名前リストを返します。
// TODO: 経由印字の詳しい仕様は別のPRで実装する
func GetVia(
	g interface {
		graph.StationProvider
		graph.TopologyProvider
	},
	path []int,
) []string {
	return []string{}
}
