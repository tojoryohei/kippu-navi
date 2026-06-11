package graph

// Validate はグラフの内部状態が正常であることを検証します。
// gobデシリアライズ後などにnilスライス・nilマップが残っていないかを確認します。
func (g *RailwayGraph) Validate() error {
	if g.FastGraph == nil || g.Edges == nil {
		return ErrInvalidGraph
	}
	if g.StationNameIDMapper == nil || g.NameToID == nil || g.IDToName == nil {
		return ErrInvalidGraph
	}
	if len(g.IDToName) == 0 {
		return ErrInvalidGraph
	}
	return nil
}
