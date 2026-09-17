package handler

import (
	"net/url"
	"testing"
)

func TestParseMaxSections(t *testing.T) {
	tests := []struct {
		name    string
		query   url.Values
		want    int
		wantErr bool
	}{
		{
			name:  "指定がなければ無制限",
			query: url.Values{},
			want:  0,
		},
		{
			name:  "指定した最大区間数を使用",
			query: url.Values{"maxSections": {"5"}},
			want:  5,
		},
		{
			name:    "空文字はエラー",
			query:   url.Values{"maxSections": {""}},
			wantErr: true,
		},
		{
			name:    "ゼロはエラー",
			query:   url.Values{"maxSections": {"0"}},
			wantErr: true,
		},
		{
			name:    "負数はエラー",
			query:   url.Values{"maxSections": {"-1"}},
			wantErr: true,
		},
		{
			name:    "整数以外はエラー",
			query:   url.Values{"maxSections": {"three"}},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseMaxSections(tt.query)
			if (err != nil) != tt.wantErr {
				t.Fatalf("parseMaxSections() error = %v, wantErr = %v", err, tt.wantErr)
			}
			if got != tt.want {
				t.Errorf("parseMaxSections() = %d, want %d", got, tt.want)
			}
		})
	}
}

func TestParseMaxSectionsOrSplits(t *testing.T) {
	tests := []struct {
		name    string
		query   url.Values
		want    int
		wantErr bool
	}{
		{name: "分割回数0は無制限", query: url.Values{"maxSplits": {"0"}}, want: 0},
		{name: "分割回数を区間数へ変換", query: url.Values{"maxSplits": {"3"}}, want: 4},
		{name: "10回まで指定可能", query: url.Values{"maxSplits": {"10"}}, want: 11},
		{name: "11回はエラー", query: url.Values{"maxSplits": {"11"}}, wantErr: true},
		{name: "従来の指定を維持", query: url.Values{"maxSections": {"5"}}, want: 5},
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
