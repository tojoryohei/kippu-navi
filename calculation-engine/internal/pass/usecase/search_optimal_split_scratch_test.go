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

	if len(store.chunks) != 2 {
		t.Fatalf("チャンク数 = %d、期待値2", len(store.chunks))
	}

	store.Reset()
	if store.count != 0 {
		t.Fatalf("Reset()後の件数 = %d、期待値0", store.count)
	}
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

func TestDPScratchAllocationPhases(t *testing.T) {
	var scratch dpScratch

	scratch.ensureCandidateBuffers(32)
	if len(scratch.stationToIndex) != 32 || len(scratch.candFlags) != 32 || len(scratch.candStationsBuf) != 32 {
		t.Fatalf("候補バッファーが指定したサイズで確保されていません")
	}
	if scratch.distTable != nil || scratch.headTable != nil || scratch.pathBuf != nil || scratch.localFares != nil {
		t.Fatalf("候補バッファーの確保時にDPバッファーも確保されています")
	}
	if len(scratch.nodes.chunks) != 0 {
		t.Fatalf("候補バッファーの確保時にノードチャンクも確保されています")
	}

	scratch.ensureDPBuffers(4, 8)
	if len(scratch.distTable) != 40 || len(scratch.headTable) != 40 {
		t.Fatalf("DPテーブルのサイズが不正です: 距離=%d 先頭=%d", len(scratch.distTable), len(scratch.headTable))
	}
	if len(scratch.pathBuf) != 6 || len(scratch.localFares) != 64 {
		t.Fatalf("DPバッファーのサイズが不正です: 経路=%d 運賃=%d", len(scratch.pathBuf), len(scratch.localFares))
	}
	if len(scratch.nodes.chunks) != 0 {
		t.Fatalf("最初の追加より前にノードチャンクが確保されています")
	}

	scratch.appendNode(staticListNode{})
	if len(scratch.nodes.chunks) != 1 {
		t.Fatalf("最初の追加で確保されたチャンク数は%dですが、期待値は1です", len(scratch.nodes.chunks))
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
