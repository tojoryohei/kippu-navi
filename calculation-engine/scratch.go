package main

import (
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/graphdata"
	"fmt"
	"log"
	"io"
)

func main() {
	loader := &graphio.JSONLoader{}
	physicalGraph, _, err := loader.LoadSeparatedGraphs(
		[]io.Reader{graphdata.GetEdgesReader()},
		[]io.Reader{graphdata.GetVirtualEdgesReader()},
	)
	if err != nil {
		log.Fatal(err)
	}
	
	g := physicalGraph
	fromID, _ := g.GetID("蒲田")
	toID, _ := g.GetID("熱海")
	res, _ := g.FindShortestPathGisei(fromID, toID)
	for _, id := range res.StationIDs {
		fmt.Printf("%s ", g.GetName(id))
	}
	fmt.Printf("\nTotal Eigyo: %d\n", res.EigyoKilo)
}
