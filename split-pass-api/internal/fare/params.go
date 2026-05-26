package fare

import "split-pass-api/internal/domain"

type RouteType int

const (
	RouteTypeTrunkOnly RouteType = iota // 幹線のみ
	RouteTypeLocalOnly                  // 地方交通線のみ
	RouteTypeMixed                      // 幹線と地方交通線をまたぐ
)

// PassFareParams は定期運賃計算のパラメータです
type PassFareParams struct {
	RouteType RouteType
	EigyoKilo domain.DeciKilo // 営業キロ
	GiseiKilo domain.DeciKilo // 運賃計算キロ
	Months    int             // 1, 3, 6
}

// PassFare は各月数の運賃をまとめた構造体です
type PassFare struct {
	OneMonth   int
	ThreeMonth int
	SixMonth   int
}
