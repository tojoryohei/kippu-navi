package domain

// IsKitaSenjuAyasePath は旅客営業規則第16条の5の発売制限に該当する経路を判定します。
func IsKitaSenjuAyasePath(path []int, stationName func(int) string) bool {
	if len(path) != 2 {
		return false
	}
	start, end := stationName(path[0]), stationName(path[1])
	return (start == "北千住" && end == "綾瀬") || (start == "綾瀬" && end == "北千住")
}
