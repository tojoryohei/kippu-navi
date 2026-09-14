package domain

import (
	"fmt"
)

// LineType は路線の種別（幹線、地方交通線など）を表します。
type LineType int

const (
	LineTypeTrunkOnly LineType = iota // 幹線のみ
	LineTypeLocalOnly                 // 地方交通線のみ
	LineTypeMixed                     // 幹線と地方交通線をまたぐ
)

// DetermineLineType は幹線・地方交通線の有無から LineType を判定します。
func DetermineLineType(hasTrunk, hasLocal bool) (LineType, error) {
	if !hasTrunk && !hasLocal {
		return 0, fmt.Errorf("DetermineLineType: %w", ErrNoLineType)
	}
	if hasTrunk && hasLocal {
		return LineTypeMixed, nil
	}
	if hasLocal {
		return LineTypeLocalOnly, nil
	}
	return LineTypeTrunkOnly, nil
}
