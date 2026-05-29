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
