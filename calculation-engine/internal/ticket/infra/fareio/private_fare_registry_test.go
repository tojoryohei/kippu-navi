package fareio

import (
	"calculation-engine/internal/graphdata"
	"encoding/json"
	"testing"
)

// グラフから必要なODを独立に列挙し、新しい探索駅の追加時にも登録漏れを検出する。
func TestPrivateFaresCoverCompanyComponents(t *testing.T) {
	var via struct {
		Lines map[string]struct {
			Company string `json:"company"`
		} `json:"lines"`
	}
	if err := json.NewDecoder(graphdata.GetPrivateViaReader()).Decode(&via); err != nil {
		t.Fatal(err)
	}
	var edges []struct{ Line, Station0, Station1 string }
	if err := json.NewDecoder(graphdata.GetConnectingEdgesReader()).Decode(&edges); err != nil {
		t.Fatal(err)
	}
	adj := map[string]map[string][]string{}
	for _, e := range edges {
		c := via.Lines[e.Line].Company
		if c == "" {
			t.Fatalf("会社未登録: %s", e.Line)
		}
		if adj[c] == nil {
			adj[c] = map[string][]string{}
		}
		adj[c][e.Station0] = append(adj[c][e.Station0], e.Station1)
		adj[c][e.Station1] = append(adj[c][e.Station1], e.Station0)
	}
	reg, err := NewPrivateFareRegistry()
	if err != nil {
		t.Fatal(err)
	}
	expected := map[[3]string]bool{}
	for c, g := range adj {
		for start := range g {
			seen := map[string]bool{start: true}
			queue := []string{start}
			for len(queue) > 0 {
				n := queue[0]
				queue = queue[1:]
				for _, next := range g[n] {
					if !seen[next] {
						seen[next] = true
						queue = append(queue, next)
					}
				}
			}
			for end := range seen {
				if start == end {
					continue
				}
				f, ok := reg.GetFare(c, start, end)
				if !ok || f <= 0 {
					t.Errorf("運賃未登録: %s %s―%s", c, start, end)
				}
				if start < end {
					expected[[3]string{c, start, end}] = true
				}
			}
		}
	}
	for _, f := range reg.fares {
		a, b := f.StartStation, f.EndStation
		if a > b {
			a, b = b, a
		}
		key := [3]string{f.Company, a, b}
		if !expected[key] {
			t.Errorf("重複または対象外の運賃: %+v", f)
		}
		delete(expected, key)
	}
	if len(expected) > 0 {
		t.Errorf("未登録OD: %v", expected)
	}
	if _, ok := reg.GetFare("別会社", "青森", "目時"); ok {
		t.Fatal("会社の異なる運賃が一致した")
	}
}
