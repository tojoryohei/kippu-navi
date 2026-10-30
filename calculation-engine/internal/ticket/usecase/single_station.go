package usecase

// SingleStationOptions は発着別に第86・87・88条の特例補正を抑止します。
// リクエスト単位で渡し、共有計算器の状態には保持しません。
type SingleStationOptions struct {
	DepartureSingleStation bool `json:"departureSingleStation"`
	ArrivalSingleStation   bool `json:"arrivalSingleStation"`
}

func singleStationOptions(options []SingleStationOptions) SingleStationOptions {
	if len(options) > 0 {
		return options[0]
	}
	return SingleStationOptions{}
}
