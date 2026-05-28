package domain

// CompanyID は鉄道会社ID
type CompanyID int

// 会社IDの定数
const (
	Other CompanyID = iota
	JRHokkaido
	JREast
	JRCentral
	JRWest
	JRShikoku
	JRKyushu
)
