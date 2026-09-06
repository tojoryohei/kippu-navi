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
		[8]byte{'T', 'K', 'S', 'R', 'V', '2', 0, 0},
		int32(2),
		[4]byte{},
		[]int32{0, 120, 120, 0},
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
