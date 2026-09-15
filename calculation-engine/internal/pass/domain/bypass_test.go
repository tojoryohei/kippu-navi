package domain

import "testing"

func TestDefaultBypassRulesAreShared(t *testing.T) {
	nextID := 0
	stationIDs := make(map[string]int)
	rules, err := NewDefaultBypassRegistry().ResolveIDs(func(name string) (int, bool) {
		if id, ok := stationIDs[name]; ok {
			return id, true
		}
		stationIDs[name] = nextID
		nextID++
		return stationIDs[name], true
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(rules) != 4 {
		t.Fatalf("共通の特例区間数 = %d, want 4", len(rules))
	}
}
