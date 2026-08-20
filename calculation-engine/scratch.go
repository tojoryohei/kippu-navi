package main

import (
	"calculation-engine/internal/ticket/infra/graphio"
	"fmt"
	"log"
)

func main() {
	g, err := graphio.LoadGraph("internal/graphdata/stations.json", "internal/graphdata/edges.json", "internal/graphdata/virtual_edges.json")
	if err != nil {
		log.Fatal(err)
	}
	fromID, _ := g.GetID("蒲田")
	toID, _ := g.GetID("熱海")
	res, _ := g.FindShortestPathGisei(fromID, toID)
	for _, id := range res.StationIDs {
		fmt.Printf("%s ", g.GetName(id))
	}
	fmt.Printf("\nTotal Eigyo: %d\n", res.EigyoKilo)
}
