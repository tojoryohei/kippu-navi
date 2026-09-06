package usecase

import (
	"calculation-engine/internal/ticket/graph"
	"math"
	"reflect"
	"testing"
)

func TestSearchUnlimitedSplit(t *testing.T) {
	g := graph.NewGraph(4)
	path := []int{
		g.GetOrAddID("A"),
		g.GetOrAddID("B"),
		g.GetOrAddID("C"),
		g.GetOrAddID("D"),
	}

	t.Run("区間数が異なる同額の解をすべて返す", func(t *testing.T) {
		fares := unavailableFares(4)
		fares[0*4+3] = 100
		fares[0*4+1] = 40
		fares[1*4+3] = 60

		search := NewSearchOptimalSplit(g, nil)
		search.SetPrecomputedFares(fares)
		cost, results := search.searchUnlimitedSplit(path)

		if cost != 100 {
			t.Fatalf("運賃 = %d, want 100", cost)
		}
		want := [][]int{{0, 3}, {0, 1, 3}}
		if !reflect.DeepEqual(results, want) {
			t.Fatalf("結果 = %v, want %v", results, want)
		}
	})

	t.Run("同額かつ同じ区間数の解をすべて返す", func(t *testing.T) {
		fares := unavailableFares(4)
		fares[0*4+3] = 100
		fares[0*4+1] = 40
		fares[1*4+3] = 50
		fares[0*4+2] = 50
		fares[2*4+3] = 40

		search := NewSearchOptimalSplit(g, nil)
		search.SetPrecomputedFares(fares)
		cost, results := search.searchUnlimitedSplit(path)

		if cost != 90 {
			t.Fatalf("運賃 = %d, want 90", cost)
		}
		want := [][]int{{0, 1, 3}, {0, 2, 3}}
		if !reflect.DeepEqual(results, want) {
			t.Fatalf("結果 = %v, want %v", results, want)
		}
	})
}

func unavailableFares(numStations int) []int32 {
	fares := make([]int32, numStations*numStations)
	for i := range fares {
		fares[i] = math.MaxInt32
	}
	return fares
}
