package domain

import "errors"

var (
	// ErrInvalidMonths は不正な月数が指定された場合のエラーです。
	ErrInvalidMonths = errors.New("不正な月数です（1, 3, 6のいずれかを指定してください）")

	// ErrStationNotFound は、指定された駅が見つからない場合のエラーです。
	ErrStationNotFound = errors.New("駅が見つかりません")

	// ErrSameStation は、開始駅と終了駅が同じ場合に発生するエラーです。
	ErrSameStation = errors.New("同一駅間の加算運賃は設定できません")

	// ErrNegativeDistance は、距離に負の値が指定された場合のエラーです。
	ErrNegativeDistance = errors.New("距離は0以上でなければなりません")

	// ErrNoRouteType は、幹線も地方交通線も含まれていない場合のエラーです。
	ErrNoRouteType = errors.New("幹線も地方交通線も含まれていません")

	// ErrInvalidPath は、経路が無効な場合（駅数が足りないなど）のエラーです。
	ErrInvalidPath = errors.New("経路には少なくとも2つの駅が必要です")

	// ErrUnknownCompany は、指定された会社IDが未知の場合のエラーです。
	ErrUnknownCompany = errors.New("未知の会社ID")
)
