package handler

import (
	"calculation-engine/internal/pass/graph"
	"net/url"
	"testing"
)

func TestParseMaxSectionsOrSplits(t *testing.T) {
	tests := []struct {
		name    string
		query   url.Values
		want    int
		wantErr bool
	}{
		{name: "分割回数0は無制限", query: url.Values{"maxSplits": {"0"}}, want: 0},
		{name: "分割回数を区間数へ変換", query: url.Values{"maxSplits": {"1"}}, want: 2},
		{name: "10回まで指定可能", query: url.Values{"maxSplits": {"10"}}, want: 11},
		{name: "範囲外はエラー", query: url.Values{"maxSplits": {"11"}}, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseMaxSectionsOrSplits(tt.query)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseMaxSectionsOrSplits() error = %v, wantErr = %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("parseMaxSectionsOrSplits() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestParseLockedStationIDs(t *testing.T) {
	g := graph.NewGraph(3)
	a := g.GetOrAddID("A")
	g.GetOrAddID("B")
	g.GetOrAddID("C")

	got, err := parseLockedStationIDs(url.Values{"noSplitStation": {"B", "B", "A"}}, g)
	if err != nil {
		t.Fatalf("parseLockedStationIDs() error = %v", err)
	}
	if len(got) != 2 || got[0] != a+1 || got[1] != a {
		t.Fatalf("parseLockedStationIDs() = %v", got)
	}
	if _, err := parseLockedStationIDs(url.Values{"noSplitStation": {"unknown"}}, g); err == nil {
		t.Fatal("未知の駅名がエラーになりませんでした")
	}
}
