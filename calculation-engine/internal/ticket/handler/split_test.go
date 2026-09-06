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
