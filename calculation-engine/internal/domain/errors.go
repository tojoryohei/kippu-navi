package domain

import "errors"

// DisconnectedRouteErrorMessage は、JR在来線だけでは接続できない区間に対する案内です。
const DisconnectedRouteErrorMessage = "指定された区間はJR在来線のみで繋がっていません。経路入力検索を利用してください。"

var (
	// ErrInvalidMonths は不正な月数が指定された場合のエラーです。
	ErrInvalidMonths = errors.New("不正な月数です（1, 3, 6のいずれかを指定してください）")

	// ErrStationNotFound は、指定された駅が見つからない場合のエラーです。
	ErrStationNotFound = errors.New("駅が見つかりません")

	// ErrSameStation は、開始駅と終了駅が同じ場合に発生するエラーです。
	ErrSameStation = errors.New("同一駅間の加算運賃は設定できません")

	// ErrNegativeDistance は、距離に負の値が指定された場合のエラーです。
	ErrNegativeDistance = errors.New("距離は0以上でなければなりません")

	// ErrNoLineType は、幹線も地方交通線も含まれていない場合のエラーです。
	ErrNoLineType = errors.New("幹線も地方交通線も含まれていません")

	// ErrInvalidPath は、経路が無効な場合（駅数が足りないなど）のエラーです。
	ErrInvalidPath = errors.New("経路には少なくとも2つの駅が必要です")

	// ErrDuplicateRoute は、発売不可となる駅重複を含む経路が指定された場合のエラーです。
	ErrDuplicateRoute = errors.New("経路が重複しています。")

	// ErrRequestedSection は、最短経路補正後に要求された新幹線区間を利用できない場合のエラーです。
	ErrRequestedSection = errors.New("再考：要求区間誤り")

	// ErrUnknownCompany は、指定された会社IDが未知の場合のエラーです。
	ErrUnknownCompany = errors.New("未知の会社ID")

	// ErrNoValidPattern は、有効な分割パターンが見つからなかった場合のエラーです。
	ErrNoValidPattern = errors.New("有効な分割パターンが見つかりませんでした")

	// ErrEmptyGraph は、グラフが空（駅やエッジが存在しない）の場合のエラーです。
	ErrEmptyGraph = errors.New("グラフが空です")

	// ErrNoPathExists は、指定された2点間に経路が存在しない場合のエラーです。
	ErrNoPathExists = errors.New("経路が存在しません")
)
