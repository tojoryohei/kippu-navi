package usecase

import (
	"calculation-engine/internal/ticket/graph"
	"reflect"
	"testing"
)

func TestCheapestViaRestoresLines(t *testing.T) {
	for _, tt := range []struct{ names, codes, printed []string }{
		{[]string{"上野", "大宮"}, []string{"トホシ"}, []string{"上野", "新幹線", "大宮"}},
		{[]string{"上野", "大宮", "熊谷", "本庄早稲田", "高崎"}, []string{"シヨシ", "シヨシ", "シヨシ", "シヨシ"}, []string{"上野", "新幹線", "熊谷", "高崎線"}},
		{[]string{"上野", "大宮", "熊谷", "本庄早稲田", "高崎", "上毛高原"}, []string{"シヨシ", "シヨシ", "シヨシ", "シヨシ", "シヨシ"}, []string{"上野", "新幹線", "熊谷", "高崎線", "高崎", "新幹線", "上毛高原"}},
		{[]string{"上野", "大宮", "熊谷", "本庄早稲田", "高崎", "安中榛名"}, []string{"ホクシ", "ホクシ", "ホクシ", "ホクシ", "ホクシ"}, []string{"上野", "新幹線", "熊谷", "高崎線", "高崎", "新幹線", "安中榛名"}},
		{[]string{"小山", "大宮", "熊谷", "本庄早稲田", "高崎", "安中榛名"}, []string{"トホシ", "ホクシ", "ホクシ", "ホクシ", "ホクシ"}, []string{"小山", "新幹線", "大宮", "新幹線", "熊谷", "高崎線", "高崎", "新幹線", "安中榛名"}},
		{[]string{"高畠", "赤湯"}, []string{"オウウ"}, []string{"奥羽"}},
		{[]string{"米沢", "高畠", "赤湯", "かみのやま温泉"}, []string{"カタシ", "オウウ", "カタシ"}, []string{"米沢", "山形新幹線", "高畠", "奥羽", "赤湯", "山形新幹線", "かみのやま温泉"}},
		{[]string{"東中野", "中野", "西船橋", "船橋"}, []string{"チユト", "メトロ東西", "ソウフ"}, []string{"中央東", "中野", "西船橋", "総武"}},
		{[]string{"東京都区内", "東京", "上野", "大宮"}, []string{"", "トホシ", "トホシ"}, []string{"新幹線", "大宮"}},
		{[]string{"中野", "西船橋"}, []string{"メトロ東西"}, []string{}},
		{[]string{"津幡", "倶利伽羅", "高岡"}, []string{"いしかわ", "とやま鉄道"}, []string{"ＩＲいしかわ", "倶利伽羅", "あいの風とやま"}},
		{[]string{"小倉", "博多", "姪浜"}, []string{"シンカ", "地下鉄空港"}, []string{"小倉", "新幹線", "博多", "福岡市高速鉄"}},
	} {
		t.Run(tt.names[0]+"→"+tt.names[len(tt.names)-1], func(t *testing.T) {
			for _, reverse := range []bool{false, true} {
				names, codes, printed := tt.names, tt.codes, tt.printed
				if reverse {
					names = reverseStrings(names)
					codes = reverseStrings(codes)
					printed = reverseStrings(printed)
				}
				g := graph.NewGraph(len(names))
				ids := make([]int, len(names))
				for i, name := range names {
					ids[i] = g.GetOrAddID(name)
				}
				steps := cheapestViaSteps(g, ids)
				gotCodes := make([]string, len(steps)-1)
				for i := range gotCodes {
					gotCodes[i] = steps[i].LineName
				}
				if !reflect.DeepEqual(gotCodes, codes) {
					t.Fatalf("codes=%v want=%v", gotCodes, codes)
				}
				if got := GetCheapestFareViaForResult(g, ids, ids); !reflect.DeepEqual(got, printed) {
					t.Fatalf("printing=%v want=%v", got, printed)
				}
			}
		})
	}
}
