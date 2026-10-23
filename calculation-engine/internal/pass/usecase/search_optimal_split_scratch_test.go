package usecase

import "testing"

func TestStaticListNodeStoreAcrossChunkBoundary(t *testing.T) {
	var store staticListNodeStore
	lastIndex := staticListNodeChunkSize + 1

	for i := 0; i <= lastIndex; i++ {
		got := store.Append(staticListNode{parentIdx: i, sections: i + 1, next: i - 1})
		if got != i {
			t.Fatalf("Append()のインデックス = %d、期待値%d", got, i)
		}
	}

	for _, index := range []int{staticListNodeChunkSize - 1, staticListNodeChunkSize, staticListNodeChunkSize + 1} {
		got := store.At(index)
		if got.parentIdx != index || got.sections != index+1 || got.next != index-1 {
			t.Errorf("At(%d)の結果 = %+v", index, got)
		}
	}

	store.Reset()
	if len(store.chunks) != 2 {
		t.Fatalf("Reset()がチャンクを解放しています: 実際%d、期待値2", len(store.chunks))
	}

	if got := store.Append(staticListNode{parentIdx: 42}); got != 0 {
		t.Fatalf("Reset()後のAppend()のインデックス = %d、期待値0", got)
	}
	if got := store.At(0).parentIdx; got != 42 {
		t.Fatalf("再利用後のAt(0).parentIdx = %d、期待値42", got)
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
