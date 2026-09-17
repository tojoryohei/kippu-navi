package main

import (
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
	"testing"
)

func TestDebugAizu(t *testing.T) {
	d, err := newScanData()
	if err != nil {
		t.Fatal(err)
	}
	names := []string{"奥新川", "作並", "熊ケ根", "陸前白沢", "愛子", "陸前落合", "葛岡", "国見", "東北福祉大前", "北山", "北仙台", "東照宮", "仙台", "長町", "太子堂", "南仙台", "名取", "館腰", "岩沼", "槻木", "（北）船岡", "（北）大河原", "北白川", "東白石", "（北）白石", "越河", "貝田", "藤田", "桑折", "伊達", "東福島", "（北）福島", "南福島", "金谷川", "松川", "安達", "二本松", "杉田", "本宮", "五百川", "日和田", "（北）郡山", "郡山富田", "喜久田", "安子ケ島", "磐梯熱海", "中山宿", "上戸", "猪苗代湖畔", "関都", "川桁", "猪苗代", "翁島", "磐梯町", "東長原", "広田", "会津若松"}
	path := make([]int, len(names))
	for i, n := range names {
		id, ok := d.full.GetID(n)
		if !ok {
			t.Fatalf("missing %s", n)
		}
		path[i] = id
	}
	reg, err := ticketfareio.NewRegistry()
	if err != nil {
		t.Fatal(err)
	}
	m, _, err := loadMatcher(reg.GetAdjustedFares(), d.full)
	if err != nil {
		t.Fatal(err)
	}
	fare, ok := m.Search(path)
	t.Logf("input adjusted=%d ok=%v len=%d", fare, ok, len(path))
	got, err := ticketusecase.SelectCheapestPathWithRouteExtensions(path, d.full, nil, nil, d.zones, func(p []int) (int, error) {
		r, _, e := d.current.ExecuteWithMode(p, 0, "normal")
		if e != nil {
			return 0, e
		}
		ns := make([]string, len(p))
		for i, id := range p {
			ns[i] = d.full.GetName(id)
		}
		t.Logf("candidate len=%d end=%s fare=%d path=%v", len(p), ns[len(ns)-1], r.TotalAmount(), ns)
		return r.TotalAmount(), nil
	})
	if err != nil {
		t.Fatal(err)
	}
	ns := make([]string, len(got))
	for i, id := range got {
		ns[i] = d.full.GetName(id)
	}
	r, _, err := d.current.ExecuteWithMode(got, 0, "normal")
	if err != nil {
		t.Fatal(err)
	}
	t.Logf("selected fare=%d end=%s path=%v", r.TotalAmount(), ns[len(ns)-1], ns)
}
