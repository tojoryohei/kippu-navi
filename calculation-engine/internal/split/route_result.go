package split

type RouteFare struct {
	TotalEigyoKilo   int      `json:"totalEigyoKilo"`
	DepartureStation string   `json:"departureStation"`
	ArrivalStation   string   `json:"arrivalStation"`
	PrintedViaLines  []string `json:"printedViaLines"`
	Fare             int      `json:"fare"`
	ValidDays        int      `json:"validDays"`
}

type RouteSplitSegment struct {
	DepartureStation string    `json:"departureStation"`
	ArrivalStation   string    `json:"arrivalStation"`
	Fare             RouteFare `json:"fare"`
}
type RouteSplitPlan struct {
	Segments  []RouteSplitSegment `json:"segments"`
	TotalFare int                 `json:"totalFare"`
}
type RouteReplacement struct {
	From   string `json:"from"`
	To     string `json:"to"`
	Status string `json:"status"`
}
type RouteSplitCandidates struct {
	Names        []string           `json:"names"`
	Replacements []RouteReplacement `json:"replacements,omitempty"`
}
type RouteSplitResult struct {
	Replacements []RouteReplacement `json:"replacements,omitempty"`
	Normal       RouteFare          `json:"normal"`
	Results      []RouteSplitPlan   `json:"results"`
}
