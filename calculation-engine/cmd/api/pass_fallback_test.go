package main

import (
	"bytes"
	"calculation-engine/internal/domain"
	pd "calculation-engine/internal/pass/domain"
	"calculation-engine/internal/pass/fare"
	"calculation-engine/internal/pass/graph"
	data "calculation-engine/internal/pass/graph/data"
	"calculation-engine/internal/pass/handler"
	"calculation-engine/internal/pass/optimizer"
	"calculation-engine/internal/pass/usecase"
	"encoding/binary"
	"fmt"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync"
	"testing"
)

func TestPassPrecomputedFallback(t *testing.T) {
	g := graph.NewGraph(3)
	for _, name := range []string{"A", "B", "C"} {
		g.GetOrAddID(name)
	}
	for _, p := range [][2]int{{0, 1}, {1, 0}, {1, 2}, {2, 1}} {
		g.AddEdge(pd.PassEdge{Edge: domain.Edge{FromID: p[0], ToID: p[1], EigyoKilo: 100, GiseiKilo: 100, Company: domain.JREast}, IsIcPassArea: true})
	}
	ic, err := graph.NewIcPassGraph(g)
	if err != nil {
		t.Fatal(err)
	}
	reg := fare.NewRegistry()
	var table [101]pd.PassPrice
	for i := range table {
		price := 1000
		if i > 10 {
			price = 2500
		}
		table[i] = pd.PassPrice{OneMonth: price, ThreeMonth: price * 3, SixMonth: price * 6}
	}
	reg.Register(domain.JREast, fare.NewEastCalculator(table, table))
	reg.Register(domain.JRCentral, fare.NewStandardCalculator(table, table))
	calc := usecase.NewCalculateAmount(g, reg, pd.NewAddonRegistry(), pd.NewAddonRegistry(), fare.NewTrainSpecificSectionCalculator(table), fare.NewPathMatcher(), fare.NewPathMatcher(), nil)
	split := usecase.NewFindOptimalSplit(optimizer.NewDPOptimizer(calc), calc)
	buf := new(bytes.Buffer)
	buf.WriteString("SRVRBIN\x00")
	write := func(v any) {
		t.Helper()
		if err := binary.Write(buf, binary.LittleEndian, v); err != nil {
			t.Fatal(err)
		}
	}
	write(int32(3))
	write(int32(0))
	for _, target := range []*graph.RailwayGraph{g, ic} {
		for _, months := range []int{1, 3, 6} {
			for a := 0; a < 3; a++ {
				_, pg := target.FindAllShortestPathsGisei(a)
				_, pe := target.FindAllShortestPathsEigyo(a)
				for b := 0; b < 3; b++ {
					value := 0
					if a != b {
						value = usecase.ComputeCheapestNoSplit(target, calc, nil, pg, pe, a, b, months)
					}
					write(int32(value))
				}
			}
		}
	}
	for _, target := range []*graph.RailwayGraph{g, ic} {
		for a := 0; a < 3; a++ {
			dist, _ := target.FindAllShortestPathsGisei(a)
			for b := 0; b < 3; b++ {
				write(uint16(dist[b]))
			}
		}
	}
	valid := buf.Bytes()
	mismatch := append([]byte(nil), valid...)
	binary.LittleEndian.PutUint32(mismatch[8:12], 2)
	responses := map[string]string{}
	for _, tc := range []struct {
		name     string
		contents []byte
	}{
		{"valid", valid}, {"missing", nil}, {"corrupt", []byte("invalid")}, {"mismatch", mismatch},
	} {
		t.Run(tc.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "pass.bin")
			if tc.contents != nil {
				if err := os.WriteFile(path, tc.contents, 0600); err != nil {
					t.Fatal(err)
				}
			}
			g.DistGisei = nil
			ic.DistGisei = nil
			baseFactory, icFactory := newPassSearchFactories(path, g, ic, split, nil)
			defer data.ClosePrecomputedFares()
			if got := len(g.DistGisei) > 0 && len(ic.DistGisei) > 0; got != (tc.name == "valid") {
				t.Fatalf("distance tables installed=%v", got)
			}
			for i, factory := range []func() *usecase.SearchOptimalSplit{baseFactory, icFactory} {
				firstSearch, secondSearch := factory(), factory()
				if got := firstSearch == secondSearch; got != (tc.name == "valid") {
					t.Fatalf("shared search=%v", got)
				}
				target := g
				if i == 1 {
					target = ic
				}
				h := handler.NewSplitWithSearchFactory(target, factory)
				for _, months := range []int{1, 3, 6} {
					for _, extra := range []string{"", "&maxSplits=1", "&noSplitStation=B", "invalid"} {
						query := fmt.Sprintf("/?from=A&to=C&months=%d%s", months, extra)
						want := 200
						if extra == "invalid" {
							query = "/?from=A&to=C&months=invalid"
							want = 400
						}
						key := fmt.Sprintf("%d:%s", i, query)
						check := func() string {
							r := httptest.NewRecorder()
							h.HandleCalculate(r, httptest.NewRequest("GET", query, nil))
							if r.Code != want {
								t.Errorf("status=%d body=%s", r.Code, r.Body.String())
							}
							return fmt.Sprintf("%d:%s", r.Code, r.Body.String())
						}
						if tc.name == "valid" {
							responses[key] = check()
						} else {
							var wg sync.WaitGroup
							for j := 0; j < 4; j++ {
								wg.Add(1)
								go func() {
									defer wg.Done()
									if got := check(); got != responses[key] {
										t.Errorf("got=%s want=%s", got, responses[key])
									}
								}()
							}
							wg.Wait()
						}
					}
				}
			}
		})
	}
}
