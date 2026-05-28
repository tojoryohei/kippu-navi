package fare

import (
	"errors"
	"fmt"
	"split-pass-api/internal/domain"
)

var ErrCalculatorNotFound = errors.New("指定された会社のCalculatorが見つかりません")

// Calculator は各社の定期運賃を計算するインターフェースです
type Calculator interface {
	Calculate(params domain.PassFareParams) (int, error)
}

// Registry は会社IDとCalculatorの対応を管理します。
// グローバル状態を持たないため、複数インスタンスの生成やテストでの差し替えが可能です。
type Registry struct {
	calcs map[domain.CompanyID]Calculator
}

// NewRegistry は空の Registry を作成します
func NewRegistry() *Registry {
	return &Registry{
		calcs: make(map[domain.CompanyID]Calculator),
	}
}

// Register は会社IDに対応する Calculator を登録します
func (r *Registry) Register(id domain.CompanyID, calc Calculator) {
	r.calcs[id] = calc
}

// Get は指定された会社IDの Calculator を返します
func (r *Registry) Get(id domain.CompanyID) (Calculator, error) {
	calc, ok := r.calcs[id]
	if !ok {
		return nil, fmt.Errorf("fare: companyID=%d: %w", id, ErrCalculatorNotFound)
	}
	return calc, nil
}

// calculatorEntry は会社IDとそのファクトリ関数のペアです
type calculatorEntry struct {
	id      domain.CompanyID
	factory func() (Calculator, error)
}

// InitRegistry は全ての運賃計算機を初期化した Registry を返します。
// いずれか1つでも初期化に失敗した場合は、登録を一切行わずエラーを返します。
func InitRegistry() (*Registry, error) {
	entries := []calculatorEntry{
		{domain.JRHokkaido, func() (Calculator, error) { return NewHokkaidoCalculator() }},
		{domain.JREast, func() (Calculator, error) { return NewEastCalculator() }},
		{domain.JRCentral, func() (Calculator, error) { return NewStandardCalculator() }},
		{domain.JRWest, func() (Calculator, error) { return NewStandardCalculator() }},
		{domain.JRShikoku, func() (Calculator, error) { return NewShikokuCalculator() }},
		{domain.JRKyushu, func() (Calculator, error) { return NewKyushuCalculator() }},
	}

	// 全社の初期化を先に試みる。1つでも失敗したら即座に中断し、
	// 部分的な登録が残らないようにする。
	built := make(map[domain.CompanyID]Calculator, len(entries))
	for _, e := range entries {
		calc, err := e.factory()
		if err != nil {
			return nil, fmt.Errorf("fare: calculatorの初期化に失敗しました。 companyID=%d: %w", e.id, err)
		}
		built[e.id] = calc
	}

	reg := NewRegistry()
	for id, calc := range built {
		reg.Register(id, calc)
	}
	return reg, nil
}
