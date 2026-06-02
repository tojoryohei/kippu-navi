package graph

import "errors"

var (
	// ErrPathNotFound は、目的地までの経路が見つからない場合のエラーです。
	ErrPathNotFound = errors.New("経路が見つかりませんでした")

	// ErrNoCandidatePaths は、候補となる経路が一つも見つからない場合のエラーです。
	ErrNoCandidatePaths = errors.New("候補経路が見つかりませんでした")

	// ErrEdgeNotFound は、指定された駅間に直接の接続がない場合のエラーです。
	ErrEdgeNotFound = errors.New("駅間に直接のエッジがありません")

	// ErrInvalidGraph は、グラフの内部状態が不正な場合のエラーです。
	ErrInvalidGraph = errors.New("グラフの内部状態が不正です（空またはnil）")
)
