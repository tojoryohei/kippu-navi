package usecase

import (
	"reflect"
	"testing"
)

func TestConventionalThroughViaBoundaries(t *testing.T) {
	for _, tc := range []struct {
		name  string
		steps []ViaStep
		want  []ViaStep
	}{
		{"単独駅着", []ViaStep{{"三島", "シンカ"}, {"（東）新富士", ""}}, nil},
		{"単独駅発", []ViaStep{{"（東）新富士", "シンカ"}, {"静岡", ""}}, nil},
		{"九州単独駅着", []ViaStep{{"博多", "キユシ"}, {"新鳥栖", ""}}, nil},
		{"単独駅で折返し", []ViaStep{{"三島", "シンカ"}, {"（東）新富士", "シンカ"}, {"三島", ""}}, nil},
		{"異なる路線", []ViaStep{{"三島", "トウカ"}, {"（東）新富士", "シンカ"}, {"静岡", ""}}, nil},
		{"別線区間", []ViaStep{{"新下関", "シンカ"}, {"小倉", "シンカ"}, {"博多", ""}}, nil},
		{"山陽逆方向", []ViaStep{{"西明石", "シンカ"}, {"新神戸", "シンカ"}, {"新大阪", ""}}, []ViaStep{{"西明石", "サンヨ"}, {"神戸", "トウカ"}, {"新大阪", ""}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			want := tc.want
			if want == nil {
				want = tc.steps
			}
			original := append([]ViaStep(nil), tc.steps...)
			if got := conventionalThroughVia(tc.steps); !reflect.DeepEqual(got, want) {
				t.Fatalf("got %v want %v", got, want)
			}
			if !reflect.DeepEqual(original, tc.steps) {
				t.Fatal("input changed")
			}
		})
	}
}
