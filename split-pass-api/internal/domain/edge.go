package domain

// Edge は駅間データです
type Edge struct {
	FromID    int
	ToID      int
	EigyoKilo DeciKilo
	GiseiKilo DeciKilo
	IsLocal   bool
	Company   CompanyID
	IsTrainSpecificSection bool
	IsBarrierFreeSection   bool
}
