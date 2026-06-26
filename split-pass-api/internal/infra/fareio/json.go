package fareio

type rawFareData struct {
	OneMonth   int `json:"OneMonth"`
	ThreeMonth int `json:"ThreeMonth"`
	SixMonth   int `json:"SixMonth"`
}

type rawRouteAndFare struct {
	Route []string    `json:"route"`
	Fare  rawFareData `json:"fare"`
}
