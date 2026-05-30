package fare_test

import (
	"errors"
	"split-pass-api/internal/domain"
	"split-pass-api/internal/fare"
	"split-pass-api/internal/graph"
	"testing"
)

func TestSpecificRouteMatcher(t *testing.T) {
	matcher := fare.NewSpecificRouteMatcher()
	g := graph.NewGraph(10)

	// モックデータの準備
	idA := g.GetOrAddID("A")
	idB := g.GetOrAddID("B")
	idC := g.GetOrAddID("C")

	fares := []domain.SpecificRouteFare{
		{
			Route: []string{"A", "B", "C"},
			Fare:  domain.PassFare{OneMonth: 100, ThreeMonth: 285, SixMonth: 540},
		},
	}

	if err := matcher.LoadFromDomain(fares, g); err != nil {
		t.Fatalf("LoadFromDomain() 失敗: %v", err)
	}

	// 存在しない駅が含まれる場合のテスト
	t.Run("存在しない駅が含まれる場合はエラー", func(t *testing.T) {
		invalidFares := []domain.SpecificRouteFare{
			{
				Route: []string{"A", "Unknown"},
				Fare:  domain.PassFare{OneMonth: 100},
			},
		}
		matcher2 := fare.NewSpecificRouteMatcher()
		err := matcher2.LoadFromDomain(invalidFares, g)
		if err == nil {
			t.Error("存在しない駅に対してエラーが返されませんでした")
		}
	})

	tests := []struct {
		name     string
		route    []int
		wantHit  bool
		wantFare int // OneMonth の値で検証
	}{
		{
			name:     "完全一致（順方向）",
			route:    []int{idA, idB, idC},
			wantHit:  true,
			wantFare: 100,
		},
		{
			name:     "完全一致（逆方向）",
			route:    []int{idC, idB, idA},
			wantHit:  true,
			wantFare: 100,
		},
		{
			name:     "一部不一致（短い）",
			route:    []int{idA, idB},
			wantHit:  false,
			wantFare: 0,
		},
		{
			name:     "全く異なる経路",
			route:    []int{99, 100},
			wantHit:  false,
			wantFare: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotFare, gotHit := matcher.Search(tt.route)
			if gotHit != tt.wantHit {
				t.Errorf("Search() gotHit = %v, 期待値 %v", gotHit, tt.wantHit)
			}
			if gotHit && gotFare.OneMonth != tt.wantFare {
				t.Errorf("Search() gotFare = %v, 期待値 %v", gotFare.OneMonth, tt.wantFare)
			}
		})
	}
}

func TestSpecificRouteMatcher_DuplicateRegistration(t *testing.T) {
	matcher := fare.NewSpecificRouteMatcher()
	route := []int{1, 2, 3}
	rev := []int{3, 2, 1}
	f := domain.PassFare{OneMonth: 100}

	// 1. 初回登録（成功）
	if err := matcher.Insert(route, f); err != nil {
		t.Fatalf("初回登録に失敗しました: %v", err)
	}

	// 2. 同じ経路を再登録（エラー）
	if err := matcher.Insert(route, f); !errors.Is(err, fare.ErrDuplicateRoute) {
		t.Errorf("同じ経路の再登録で ErrDuplicateRoute を期待しましたが、got %v", err)
	}

	// 3. 逆方向の経路を登録（エラー: すでにInsert内で登録済みのため）
	if err := matcher.Insert(rev, f); !errors.Is(err, fare.ErrDuplicateRoute) {
		t.Errorf("逆方向経路の登録で ErrDuplicateRoute を期待しましたが、got %v", err)
	}

	// 4. 回文のような経路 (1-2-1)
	palindrome := []int{1, 2, 1}
	if err := matcher.Insert(palindrome, f); err != nil {
		t.Fatalf("回文経路の登録に失敗しました: %v", err)
	}
	if err := matcher.Insert(palindrome, f); !errors.Is(err, fare.ErrDuplicateRoute) {
		t.Errorf("回文経路の再登録で ErrDuplicateRoute を期待しましたが、got %v", err)
	}
}

func TestSpecificRouteMatcher_DefensiveCopy(t *testing.T) {
	matcher := fare.NewSpecificRouteMatcher()
	route := []int{1, 2, 3}
	f := domain.PassFare{OneMonth: 100}

	if err := matcher.Insert(route, f); err != nil {
		t.Fatalf("Insert 失敗: %v", err)
	}

	// 元のスライスを書き換える
	route[0] = 999

	// 登録時の経路 {1, 2, 3} で検索できるべき
	if _, ok := matcher.Search([]int{1, 2, 3}); !ok {
		t.Error("元のスライス書き換えにより、登録済みの経路が壊れました。防御的コピーが機能していません。")
	}

	// 書き換え後の経路 {999, 2, 3} ではヒットしないべき
	if _, ok := matcher.Search([]int{999, 2, 3}); ok {
		t.Error("書き換え後のスライスでヒットしてしまいました。内部で同じ参照を保持している可能性があります。")
	}
}

// ハッシュ値の衝突が起きた場合でも正しく動作するか検証するテスト
func TestSpecificRouteMatcher_HashCollision(t *testing.T) {
	matcher := fare.NewSpecificRouteMatcher()

	// A-B-C と B-A-C は同じ要素だが順序が異なるため、FNV-1aではハッシュが異なる可能性が高いが、
	// 念のため類似配列を登録して干渉しないかテストする
	route1 := []int{1, 2, 3}
	route2 := []int{1, 3, 2}

	fare1 := domain.PassFare{OneMonth: 100}
	fare2 := domain.PassFare{OneMonth: 200}

	_ = matcher.Insert(route1, fare1) // route1 と その逆順 が 100 で登録される
	_ = matcher.Insert(route2, fare2) // route2 と その逆順 が 200 で登録される

	// 検証
	if f, hit := matcher.Search([]int{1, 2, 3}); !hit || f.OneMonth != 100 {
		t.Errorf("route1は運賃100を返すはずです, got hit=%v, fare=%v", hit, f.OneMonth)
	}
	if f, hit := matcher.Search([]int{3, 2, 1}); !hit || f.OneMonth != 100 {
		t.Errorf("route3 (route1の逆順) は運賃100を返すはずです, got hit=%v, fare=%v", hit, f.OneMonth)
	}
	if f, hit := matcher.Search([]int{1, 3, 2}); !hit || f.OneMonth != 200 {
		t.Errorf("route2は運賃200を返すはずです, got hit=%v, fare=%v", hit, f.OneMonth)
	}
	if f, hit := matcher.Search([]int{2, 3, 1}); !hit || f.OneMonth != 200 {
		t.Errorf("route2の逆順は運賃200を返すはずです, got hit=%v, fare=%v", hit, f.OneMonth)
	}
	if _, hit := matcher.Search([]int{1, 2}); hit {
		t.Errorf("部分的な経路は一致しないはずです")
	}
}
