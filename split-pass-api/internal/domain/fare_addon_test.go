package domain_test

import (
	"errors"
	"split-pass-api/internal/domain"
	"testing"
)

func TestAddonRegistry_ResolveIDs(t *testing.T) {
	// モックのリゾルバー: 特定の駅名のみIDを返す
	mockResolver := func(name string) (int, bool) {
		switch name {
		case "StationA":
			return 1, true
		case "StationB":
			return 2, true
		case "StationC":
			return 3, true
		default:
			return 0, false
		}
	}

	tests := []struct {
		name      string
		registers []struct {
			s1, s2 string
			fare   domain.PassFare
		}
		wantLookup []struct {
			id1, id2 int
			wantHit  bool
			wantFare int
		}
		wantErr error
	}{
		{
			name: "正常系: 全ての駅名が解決可能（逆引き含む）",
			registers: []struct {
				s1, s2 string
				fare   domain.PassFare
			}{
				{"StationA", "StationB", domain.PassFare{OneMonth: 100}},
			},
			wantLookup: []struct {
				id1, id2 int
				wantHit  bool
				wantFare int
			}{
				{1, 2, true, 100}, // 順引き
				{2, 1, true, 100}, // 逆引き
			},
			wantErr: nil,
		},
		{
			name: "異常系: 同一駅の登録",
			registers: []struct {
				s1, s2 string
				fare   domain.PassFare
			}{
				{"StationA", "StationA", domain.PassFare{OneMonth: 100}},
			},
			wantErr: domain.ErrSameStation,
		},
		{
			name: "異常系: 存在しない駅名が含まれる",
			registers: []struct {
				s1, s2 string
				fare   domain.PassFare
			}{
				{"StationA", "UnknownStation", domain.PassFare{OneMonth: 200}},
			},
			wantErr: domain.ErrStationNotFound,
		},
		{
			name: "正常系: 複数の区間を登録",
			registers: []struct {
				s1, s2 string
				fare   domain.PassFare
			}{
				{"StationA", "StationB", domain.PassFare{OneMonth: 100}},
				{"StationB", "StationC", domain.PassFare{OneMonth: 200}},
			},
			wantLookup: []struct {
				id1, id2 int
				wantHit  bool
				wantFare int
			}{
				{1, 2, true, 100},
				{2, 3, true, 200},
			},
			wantErr: nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := domain.NewAddonRegistry()
			for _, reg := range tt.registers {
				r.Register(reg.s1, reg.s2, reg.fare)
			}

			err := r.ResolveIDs(mockResolver)
			if !errors.Is(err, tt.wantErr) {
				t.Errorf("ResolveIDs() エラー = %v, 期待値 %v", err, tt.wantErr)
			}

			if tt.wantErr == nil {
				for _, l := range tt.wantLookup {
					fare, ok := r.Lookup(l.id1, l.id2)
					if ok != l.wantHit {
						t.Errorf("Lookup(%d, %d) ok = %v, 期待値 %v", l.id1, l.id2, ok, l.wantHit)
					}
					if ok && fare.OneMonth != l.wantFare {
						t.Errorf("Lookup(%d, %d) 運賃 = %d, 期待値 %d", l.id1, l.id2, fare.OneMonth, l.wantFare)
					}
				}
			}
		})
	}
}

func TestAddonRegistry_ResolveIDs_Recalculation(t *testing.T) {
	r := domain.NewAddonRegistry()
	r.Register("A", "B", domain.PassFare{OneMonth: 100})

	// 1回目の解決 (A=1, B=2)
	_ = r.ResolveIDs(func(name string) (int, bool) {
		if name == "A" {
			return 1, true
		}
		if name == "B" {
			return 2, true
		}
		return 0, false
	})

	if _, ok := r.Lookup(1, 2); !ok {
		t.Fatal("1回目の解決でLookupに失敗しました")
	}

	// 2回目の解決 (駅IDが変更された想定: A=10, B=20)
	_ = r.ResolveIDs(func(name string) (int, bool) {
		if name == "A" {
			return 10, true
		}
		if name == "B" {
			return 20, true
		}
		return 0, false
	})

	// 古いID (1, 2) ではヒットしなくなっているべき（クリアされていることの検証）
	if _, ok := r.Lookup(1, 2); ok {
		t.Error("2回目のResolveIDs後も古いIDでLookupできてしまいます。状態がクリアされていません。")
	}

	// 新しいID (10, 20) でヒットするべき
	if fare, ok := r.Lookup(10, 20); !ok || fare.OneMonth != 100 {
		t.Errorf("新しいIDでのLookupに失敗しました: ok=%v, fare=%v", ok, fare.OneMonth)
	}
}
