package optimizer

import "errors"

var (
	// ErrNoValidPattern は、有効な分割パターンが見つからなかった場合のエラーです。
	ErrNoValidPattern = errors.New("有効な分割パターンが見つかりませんでした")
)
