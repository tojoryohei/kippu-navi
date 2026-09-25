package data

import (
	"encoding/binary"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestLoadPrecomputedTicketFares(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ticket.bin")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []any{
		[8]byte{'T', 'K', 'S', 'R', 'V', '3', 0, 0},
		int32(2),
		uint32(TicketSectionCount),
		[]uint64{16, 8, 8},
		[]int32{0, 120, 120, 0},
		[]uint16{0, 15, 15, 0},
		[]uint16{0, 15, 15, 0},
	} {
		if err := binary.Write(file, binary.LittleEndian, value); err != nil {
			t.Fatal(err)
		}
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}

	fares, distances, numStations, err := LoadPrecomputedTicketFares(path)
	t.Cleanup(ClosePrecomputedTicketFares)
	if err != nil {
		t.Fatal(err)
	}
	if numStations != 2 {
		t.Fatalf("駅数 = %d, want 2", numStations)
	}
	if !reflect.DeepEqual(fares, []int32{0, 120, 120, 0}) {
		t.Fatalf("運賃 = %v", fares)
	}
	if !reflect.DeepEqual(distances, []uint16{0, 15, 15, 0}) {
		t.Fatalf("距離 = %v", distances)
	}
}

func TestLoadPrecomputedTicketFaresRejectsV2(t *testing.T) {
	path := filepath.Join(t.TempDir(), "ticket-v2.bin")
	if err := os.WriteFile(path, []byte("TKSRV2\x00\x00legacy"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, _, err := LoadPrecomputedTicketFares(path); err == nil {
		t.Fatal("旧形式を受理しました")
	}
}
