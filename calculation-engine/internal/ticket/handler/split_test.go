package handler

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	ticketgraph "calculation-engine/internal/ticket/graph"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestHandleCalculateRejectsDisconnectedLocalLineAreas(t *testing.T) {
	g := ticketgraph.NewGraph(4)
	aID := g.GetOrAddID("A")
	bID := g.GetOrAddID("B")
	cID := g.GetOrAddID("C")
	dID := g.GetOrAddID("D")
	for _, edge := range [][2]int{{aID, bID}, {bID, aID}, {cID, dID}, {dID, cID}} {
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: edge[0], ToID: edge[1], EigyoKilo: 10, GiseiKilo: 10}})
	}
	if err := g.Validate(); err != nil {
		t.Fatalf("グラフの検証に失敗しました: %v", err)
	}
	if got := g.GetGroupID(aID); got != 0 {
		t.Fatalf("先頭の連結成分ID = %d, want 0", got)
	}

	h := NewSplit(g, nil)
	request := httptest.NewRequest(http.MethodGet, "/api/split-ticket?from=A&to=C", nil)
	response := httptest.NewRecorder()
	h.HandleCalculate(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
	var body CalculateResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("レスポンスの解析に失敗しました: %v", err)
	}
	want := "指定された区間はJR在来線のみで繋がっていません。新幹線や私鉄線を利用する経路は検索対象外です。"
	if body.Error != want {
		t.Errorf("error = %q, want %q", body.Error, want)
	}
}

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
