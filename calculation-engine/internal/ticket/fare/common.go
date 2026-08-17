package fare

import (
	"errors"
	"fmt"
)

var (
	ErrInvalidLineType = errors.New("不正なLineTypeです")
	ErrOutOfRange       = errors.New("距離が範囲外です")
)

func calculateSplitKiloOfTrunk(totalKilo int) (int, error) {
	if 10 < totalKilo && totalKilo <= 50 {
		return ((totalKilo-1)/5)*5 + 3, nil
	}
	if 50 < totalKilo && totalKilo <= 100 {
		return ((totalKilo-1)/10)*10 + 5, nil
	}
	if 100 < totalKilo && totalKilo <= 600 {
		return ((totalKilo-1)/20)*20 + 10, nil
	}
	if 600 < totalKilo {
		return ((totalKilo-1)/40)*40 + 20, nil
	}
	return 0, fmt.Errorf("calculateSplitKiloOfTrunk: %w", ErrOutOfRange)
}

func calculateSplitKiloOfLocal(totalKilo int) (int, error) {
	if totalKilo <= 10 {
		return 0, fmt.Errorf("calculateSplitKiloOfLocal: %w", ErrOutOfRange)
	}
	if totalKilo <= 15 {
		return 13, nil
	}
	if totalKilo <= 20 {
		return 18, nil
	}
	if totalKilo <= 23 {
		return 22, nil
	}
	if totalKilo <= 28 {
		return 26, nil
	}
	if totalKilo <= 32 {
		return 30, nil
	}
	if totalKilo <= 37 {
		return 35, nil
	}
	if totalKilo <= 41 {
		return 39, nil
	}
	if totalKilo <= 46 {
		return 44, nil
	}
	if totalKilo <= 55 {
		return 51, nil
	}
	if totalKilo <= 64 {
		return 60, nil
	}
	if totalKilo <= 73 {
		return 69, nil
	}
	if totalKilo <= 82 {
		return 78, nil
	}
	if totalKilo <= 91 {
		return 87, nil
	}
	if totalKilo <= 100 {
		return 96, nil
	}
	if totalKilo <= 110 {
		return 105, nil
	}
	if totalKilo <= 128 {
		return 119, nil
	}
	if totalKilo <= 146 {
		return 137, nil
	}
	if totalKilo <= 164 {
		return 155, nil
	}
	if totalKilo <= 182 {
		return 173, nil
	}
	if totalKilo <= 200 {
		return 191, nil
	}
	if totalKilo <= 219 {
		return 210, nil
	}
	if totalKilo <= 237 {
		return 228, nil
	}
	if totalKilo <= 255 {
		return 246, nil
	}
	if totalKilo <= 273 {
		return 264, nil
	}
	if totalKilo <= 291 {
		return 282, nil
	}
	if totalKilo <= 310 {
		return 301, nil
	}
	if totalKilo <= 328 {
		return 319, nil
	}
	if totalKilo <= 346 {
		return 337, nil
	}
	if totalKilo <= 364 {
		return 355, nil
	}
	if totalKilo <= 382 {
		return 373, nil
	}
	if totalKilo <= 400 {
		return 391, nil
	}
	if totalKilo <= 419 {
		return 410, nil
	}
	if totalKilo <= 437 {
		return 428, nil
	}
	if totalKilo <= 455 {
		return 446, nil
	}
	if totalKilo <= 473 {
		return 464, nil
	}
	if totalKilo <= 491 {
		return 482, nil
	}
	if totalKilo <= 510 {
		return 501, nil
	}
	if totalKilo <= 528 {
		return 519, nil
	}
	if totalKilo <= 546 {
		return 537, nil
	}
	if totalKilo <= 582 {
		return 564, nil
	}
	if totalKilo <= 619 {
		return 601, nil
	}
	if totalKilo <= 655 {
		return 637, nil
	}
	if totalKilo <= 691 {
		return 673, nil
	}
	if totalKilo <= 728 {
		return 710, nil
	}
	if totalKilo <= 764 {
		return 746, nil
	}
	if totalKilo <= 800 {
		return 782, nil
	}
	if totalKilo <= 837 {
		return 819, nil
	}
	if totalKilo <= 873 {
		return 855, nil
	}
	if totalKilo <= 910 {
		return 892, nil
	}
	if totalKilo <= 946 {
		return 928, nil
	}
	if totalKilo <= 982 {
		return 964, nil
	}
	if totalKilo <= 1019 {
		return 1001, nil
	}
	if totalKilo <= 1055 {
		return 1037, nil
	}
	if totalKilo <= 1091 {
		return 1073, nil
	}
	if totalKilo <= 1128 {
		return 1110, nil
	}
	if totalKilo <= 1164 {
		return 1146, nil
	}
	if totalKilo <= 1200 {
		return 1182, nil
	}
	return 0, fmt.Errorf("calculateSplitKiloOfLocalで範囲外アクセスが発生しました")
}

func ceil1000(n int) int {
	return (n + 999) / 1000 * 1000
}

func round1000(n int) int {
	return (n + 500) / 1000 * 1000
}

func round10000(n int) int {
	return (n + 5000) / 10000 * 10000
}
