package fare_test

import (
	"calculation-engine/internal/pass/graph"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	"errors"
	"testing"
)

func TestPathMatcher(t *testing.T) {
	matcher := fare.NewPathMatcher()
	g := graph.NewGraph(10)

	// モックデータの準備
	idA := g.GetOrAddID("A")
	idB := g.GetOrAddID("B")
	idC := g.GetOrAddID("C")

	fares := []ticketdomain.PathAndFare{
		{
			Path: []string{"A", "B", "C"},
			Fare: 100,
		},
	}

	if err := matcher.LoadFromDomain(fares, g); err != nil {
		t.Fatalf("LoadFromDomain() 失敗: %v", err)
	}

	// 存在しない駅が含まれる場合のテスト
	t.Run("存在しない駅が含まれる場合はエラー", func(t *testing.T) {
		invalidFares := []ticketdomain.PathAndFare{
			{
				Path: []string{"A", "Unknown"},
				Fare: 100,
			},
		}
		matcher2 := fare.NewPathMatcher()
		err := matcher2.LoadFromDomain(invalidFares, g)
		if err == nil {
			t.Error("存在しない駅に対してエラーが返されませんでした")
		}
	})

	if err := matcher.Insert([]int{idA, idC, idB}, 200); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name     string
		path     []int
		wantHit  bool
		wantFare int
	}{
		{
			name:     "完全一致（順方向）",
			path:     []int{idA, idB, idC},
			wantHit:  true,
			wantFare: 100,
		},
		{
			name:     "完全一致（逆方向）",
			path:     []int{idC, idB, idA},
			wantHit:  true,
			wantFare: 100,
		},
		{name: "同じ駅でも順序が違う経路", path: []int{idA, idC, idB}, wantHit: true, wantFare: 200},
		{
			name:     "一部不一致（短い）",
			path:     []int{idA, idB},
			wantHit:  false,
			wantFare: 0,
		},
		{
			name:     "全く異なる経路",
			path:     []int{99, 100},
			wantHit:  false,
			wantFare: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotFare, gotHit := matcher.Search(tt.path)
			if gotHit != tt.wantHit {
				t.Errorf("Search() gotHit = %v, 期待値 %v", gotHit, tt.wantHit)
			}
			if gotHit && gotFare != tt.wantFare {
				t.Errorf("Search() gotFare = %v, 期待値 %v", gotFare, tt.wantFare)
			}
		})
	}
}

func TestPathMatcher_DuplicateRegistration(t *testing.T) {
	matcher := fare.NewPathMatcher()
	path := []int{1, 2, 3}
	rev := []int{3, 2, 1}
	f := 100

	// 1. 初回登録（成功）
	if err := matcher.Insert(path, f); err != nil {
		t.Fatalf("初回登録に失敗しました: %v", err)
	}

	// 2. 同じ経路を再登録（エラー）
	if err := matcher.Insert(path, f); !errors.Is(err, fare.ErrDuplicateRoute) {
		t.Errorf("同じ経路の再登録で ErrDuplicateRoute を期待しましたが、実際 %v", err)
	}

	// 3. 逆方向の経路を登録（エラー: すでにInsert内で登録済みのため）
	if err := matcher.Insert(rev, f); !errors.Is(err, fare.ErrDuplicateRoute) {
		t.Errorf("逆方向経路の登録で ErrDuplicateRoute を期待しましたが、実際 %v", err)
	}

	// 4. 回文のような経路 (1-2-1)
	palindrome := []int{1, 2, 1}
	if err := matcher.Insert(palindrome, f); err != nil {
		t.Fatalf("回文経路の登録に失敗しました: %v", err)
	}
	if err := matcher.Insert(palindrome, f); !errors.Is(err, fare.ErrDuplicateRoute) {
		t.Errorf("回文経路の再登録で ErrDuplicateRoute を期待しましたが、実際 %v", err)
	}
}

func TestPathMatcher_DefensiveCopy(t *testing.T) {
	matcher := fare.NewPathMatcher()
	path := []int{1, 2, 3}
	f := 100

	if err := matcher.Insert(path, f); err != nil {
		t.Fatalf("Insert 失敗: %v", err)
	}

	// 元のスライスを書き換える
	path[0] = 999

	// 登録時の経路 {1, 2, 3} で検索できるべき
	if _, ok := matcher.Search([]int{1, 2, 3}); !ok {
		t.Error("元のスライス書き換えにより、登録済みの経路が壊れました。防御的コピーが機能していません。")
	}

	// 書き換え後の経路 {999, 2, 3} ではヒットしないべき
	if _, ok := matcher.Search([]int{999, 2, 3}); ok {
		t.Error("書き換え後のスライスでヒットしてしまいました。内部で同じ参照を保持している可能性があります。")
	}
}
