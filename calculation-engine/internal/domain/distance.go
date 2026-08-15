package domain

import (
	"fmt"
)

// DeciKilo は距離を10倍した整数（0.1km単位での誤差を防ぐため）
type DeciKilo int

// ToCeiledKm はDeciKiloをinteger kilometerに変換します。
// 例:
//
//	15 -> 2
//	10 -> 1
//	 1 -> 1
func (d DeciKilo) ToCeiledKm() (int, error) {
	if d < 0 {
		return 0, fmt.Errorf("domain: %w", ErrNegativeDistance)
	}

	return (int(d) + 9) / 10, nil
}
