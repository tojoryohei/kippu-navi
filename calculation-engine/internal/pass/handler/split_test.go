package handler

import (
	"calculation-engine/internal/domain"
	passdomain "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/graph"
	"calculation-engine/internal/pass/usecase"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"testing"
)

func TestHandleCalculateRejectsDisconnectedRoutes(t *testing.T) {
	g := graph.NewGraph(4)
	aID := g.GetOrAddID("A")
	bID := g.GetOrAddID("B")
	cID := g.GetOrAddID("C")
	dID := g.GetOrAddID("D")
	for _, edge := range [][2]int{{aID, bID}, {bID, aID}, {cID, dID}, {dID, cID}} {
		g.AddEdge(passdomain.PassEdge{Edge: domain.Edge{FromID: edge[0], ToID: edge[1], EigyoKilo: 10, GiseiKilo: 10}})
	}

	search := usecase.NewSearchOptimalSplit(g, nil, nil, 0, nil, int32(g.NumStations()))
	h := NewSplit(g, search)
	request := httptest.NewRequest(http.MethodGet, "/api/split-pass?from=A&to=C&months=6", nil)
	response := httptest.NewRecorder()
	h.HandleCalculate(response, request)

	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusUnprocessableEntity)
	}
	var body CalculateResponse
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatalf("レスポンスの解析に失敗しました: %v", err)
	}
	if body.Error != domain.DisconnectedRouteErrorMessage {
		t.Errorf("error = %q, want %q", body.Error, domain.DisconnectedRouteErrorMessage)
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
		{"empty results", []string{"A", "B"}, nil, false},
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
		{name: "分割回数を区間数へ変換", query: url.Values{"maxSplits": {"1"}}, want: 2},
		{name: "10回まで指定可能", query: url.Values{"maxSplits": {"10"}}, want: 11},
		{name: "範囲外はエラー", query: url.Values{"maxSplits": {"11"}}, wantErr: true},
		{name: "maxSectionsは無視", query: url.Values{"maxSections": {"2"}}, want: 0},
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

func TestResolveMaxSections(t *testing.T) {
	got, err := resolveMaxSections(url.Values{"maxSplits": {"10"}}, 2)
	if err != nil {
		t.Fatalf("resolveMaxSections() error = %v", err)
	}
	if got != 2 {
		t.Fatalf("resolveMaxSections() = %d, want 2", got)
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
