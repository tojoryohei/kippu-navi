package usecase

import "testing"

func TestStaticListNodeStoreAcrossChunkBoundary(t *testing.T) {
	var store staticListNodeStore
	lastIndex := staticListNodeChunkSize + 1

	for i := 0; i <= lastIndex; i++ {
		got := store.Append(staticListNode{parentIdx: i, sections: i + 1, next: i - 1})
		if got != i {
			t.Fatalf("Append() index = %d, want %d", got, i)
		}
	}

	for _, index := range []int{staticListNodeChunkSize - 1, staticListNodeChunkSize, staticListNodeChunkSize + 1} {
		got := store.At(index)
		if got.parentIdx != index || got.sections != index+1 || got.next != index-1 {
			t.Errorf("At(%d) = %+v", index, got)
		}
	}

	if len(store.chunks) != 2 {
		t.Fatalf("chunk count = %d, want 2", len(store.chunks))
	}

	store.Reset()
	if store.count != 0 {
		t.Fatalf("count after Reset() = %d, want 0", store.count)
	}
	if len(store.chunks) != 2 {
		t.Fatalf("Reset() released chunks: got %d, want 2", len(store.chunks))
	}

	if got := store.Append(staticListNode{parentIdx: 42}); got != 0 {
		t.Fatalf("Append() after Reset() index = %d, want 0", got)
	}
	if got := store.At(0).parentIdx; got != 42 {
		t.Fatalf("At(0).parentIdx after reuse = %d, want 42", got)
	}
}

func TestDPScratchAllocationPhases(t *testing.T) {
	var scratch dpScratch

	scratch.ensureCandidateBuffers(32)
	if len(scratch.stationToIndex) != 32 || len(scratch.candFlags) != 32 || len(scratch.candStationsBuf) != 32 {
		t.Fatalf("candidate buffers were not allocated to the requested size")
	}
	if scratch.distTable != nil || scratch.headTable != nil || scratch.pathBuf != nil || scratch.localFares != nil {
		t.Fatalf("DP buffers were allocated during candidate buffer allocation")
	}
	if len(scratch.nodes.chunks) != 0 {
		t.Fatalf("node chunks were allocated during candidate buffer allocation")
	}

	scratch.ensureDPBuffers(4, 8)
	if len(scratch.distTable) != 40 || len(scratch.headTable) != 40 {
		t.Fatalf("DP tables have unexpected sizes: dist=%d head=%d", len(scratch.distTable), len(scratch.headTable))
	}
	if len(scratch.pathBuf) != 6 || len(scratch.localFares) != 64 {
		t.Fatalf("DP buffers have unexpected sizes: path=%d fares=%d", len(scratch.pathBuf), len(scratch.localFares))
	}
	if len(scratch.nodes.chunks) != 0 {
		t.Fatalf("node chunks were allocated before the first append")
	}

	scratch.appendNode(staticListNode{})
	if len(scratch.nodes.chunks) != 1 {
		t.Fatalf("first append allocated %d chunks, want 1", len(scratch.nodes.chunks))
	}
}

func BenchmarkStaticListNodeStore(b *testing.B) {
	for _, nodeCount := range []int{256, staticListNodeChunkSize * 8} {
		b.Run(benchmarkNodeCountName(nodeCount), func(b *testing.B) {
			var store staticListNodeStore
			b.ReportAllocs()
			for b.Loop() {
				store.Reset()
				for i := 0; i < nodeCount; i++ {
					store.Append(staticListNode{parentIdx: i, sections: i % 100, next: i - 1})
				}
			}
		})
	}
}

func BenchmarkSearchOptimalSplitDPMinimalCandidateCounts(b *testing.B) {
	for _, candidateCount := range []int{32, 256} {
		name := "small"
		if candidateCount == 256 {
			name = "large"
		}
		b.Run(name, func(b *testing.B) {
			fares := make([]int32, 3*candidateCount*candidateCount)
			for month := 0; month < 3; month++ {
				monthOffset := month * candidateCount * candidateCount
				for from := 0; from < candidateCount; from++ {
					for to := 0; to < candidateCount; to++ {
						if from != to {
							// 区間を増やすほど必ず高くし、最適経路数の爆発を避ける。
							fares[monthOffset+from*candidateCount+to] = int32(100000 + to - from)
						}
					}
				}
			}

			search := &SearchOptimalSplit{fares: fares, numStations: int32(candidateCount)}
			candidates := make([]int, candidateCount)
			for i := range candidates {
				candidates[i] = i
			}
			scratch := &dpScratch{}

			b.ReportAllocs()
			b.ResetTimer()
			for b.Loop() {
				_, _, err := search.searchOptimalSplitDPMinimalWithLocks(0, candidateCount-1, 1, 8, candidates, scratch, nil)
				if err != nil {
					b.Fatal(err)
				}
			}
		})
	}
}

func benchmarkNodeCountName(nodeCount int) string {
	if nodeCount < staticListNodeChunkSize {
		return "small"
	}
	return "large"
}
