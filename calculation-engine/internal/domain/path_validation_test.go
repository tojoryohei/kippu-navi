package domain

import "testing"

func TestHasDuplicateStation(t *testing.T) {
	tests := []struct {
		name string
		path []int
		want bool
	}{
		{name: "unique", path: []int{1, 2, 3}, want: false},
		{name: "duplicate in middle", path: []int{1, 2, 1, 3}, want: true},
		{name: "duplicate destination", path: []int{1, 2, 3, 2}, want: true},
		{name: "ring route destination matches origin", path: []int{1, 2, 3, 1}, want: false},
		{name: "figure-eight route destination matches an earlier station", path: []int{1, 2, 3, 4, 2}, want: false},
		{name: "same station", path: []int{1, 1}, want: false},
		{name: "empty", path: nil, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := HasDuplicateStation(tt.path); got != tt.want {
				t.Fatalf("HasDuplicateStation(%v) = %v, want %v", tt.path, got, tt.want)
			}
		})
	}
}
