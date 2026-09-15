package main

import (
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
	"testing"
)

func TestDebugCheapestHoshimi(t *testing.T) {
	d, err := newScanData()
	if err != nil {
		t.Fatal(err)
	}
	names := []string{"ほしみ", "星置", "稲穂", "手稲", "稲積公園", "発寒", "発寒中央", "琴似", "桑園", "札幌", "苗穂", "（函）白石", "厚別", "森林公園", "大麻", "野幌", "高砂", "江別", "豊幌", "幌向", "上幌向", "岩見沢", "峰延", "光珠内", "美唄", "茶志内", "奈井江", "豊沼", "砂川", "滝川", "赤平", "茂尻", "平岸", "芦別", "上芦別", "野花南", "富良野", "学田", "鹿討", "中富良野", "ラベンダー畑", "西中", "上富良野", "美馬牛", "美瑛", "北美瑛", "千代ケ岡", "西聖和", "西神楽", "西瑞穂", "西御料", "緑が丘", "神楽岡", "旭川", "旭川四条", "新旭川", "南永山"}
	path := make([]int, len(names))
	for i, n := range names {
		id, ok := d.full.GetID(n)
		if !ok {
			t.Fatalf("missing %s", n)
		}
		path[i] = id
	}
	m, err := ticketusecase.NewRouteExtensionMatcherIDs(ticketfareio.GetGeneratedRouteExtensions(), d.full)
	if err != nil {
		t.Fatal(err)
	}
	got, err := ticketusecase.SelectCheapestPathWithRouteExtensions(path, d.full, nil, m, d.zones, func(p []int) (int, error) {
		r, _, e := d.current.ExecuteWithMode(p, 0, "normal")
		if e != nil {
			return 0, e
		}
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
	t.Logf("fare=%d end=%s pathlen=%d", r.TotalAmount(), ns[len(ns)-1], len(ns))
	if ns[len(ns)-1] != "東旭川" || r.TotalAmount() != 4840 {
		t.Fatalf("unexpected fare/path: %d %v", r.TotalAmount(), ns)
	}
}
