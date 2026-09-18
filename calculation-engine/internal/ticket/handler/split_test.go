package handler

import (
	"net/url"
	"testing"
)

func TestValidResponsePaths(t *testing.T) {
	tests := []struct {
		name    string
		normal  []string
		results [][]string
		want    bool
	}{
		{"valid", []string{"A", "B"}, [][]string{{"A", "C", "B"}}, true},
		{"empty normal", nil, nil, false},
		{"short normal", []string{"A"}, nil, false},
		{"short result", []string{"A", "B"}, [][]string{{"A"}}, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := validResponsePaths(tt.normal, tt.results); got != tt.want {
				t.Fatalf("validResponsePaths() = %v, want %v", got, tt.want)
			}
		})
	}
}

func TestParseMaxSplits(t *testing.T) {
	tests := []struct {
		name    string
		query   url.Values
		want    int
		wantErr bool
	}{
		{name: "省略時は無制限", query: url.Values{}, want: 0},
		{name: "分割回数0は無制限", query: url.Values{"maxSplits": {"0"}}, want: 0},
		{name: "分割回数を区間数へ変換", query: url.Values{"maxSplits": {"3"}}, want: 4},
		{name: "10回まで指定可能", query: url.Values{"maxSplits": {"10"}}, want: 11},
		{name: "11回はエラー", query: url.Values{"maxSplits": {"11"}}, wantErr: true},
		{name: "maxSectionsは無視", query: url.Values{"maxSections": {"5"}}, want: 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseMaxSplits(tt.query)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseMaxSplits() error = %v, wantErr = %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("parseMaxSplits() = %d, want %d", got, tt.want)
			}
		})
	}
}
