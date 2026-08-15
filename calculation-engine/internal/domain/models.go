package domain

import (
	"fmt"
)

// RouteType は路線の種別（幹線、地方交通線など）を表します。
type RouteType int

const (
	RouteTypeTrunkOnly RouteType = iota // 幹線のみ
	RouteTypeLocalOnly                  // 地方交通線のみ
	RouteTypeMixed                      // 幹線と地方交通線をまたぐ
)

// DetermineRouteType は幹線・地方交通線の有無から RouteType を判定します。
func DetermineRouteType(hasTrunk, hasLocal bool) (RouteType, error) {
	if !hasTrunk && !hasLocal {
		return 0, fmt.Errorf("DetermineRouteType: %w", ErrNoRouteType)
	}
	if hasTrunk && hasLocal {
		return RouteTypeMixed, nil
	}
	if hasLocal {
		return RouteTypeLocalOnly, nil
	}
	return RouteTypeTrunkOnly, nil
}
