package fare

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"errors"
	"fmt"
)

var ErrCalculatorNotFound = errors.New("指定された会社のCalculatorが見つかりません")

// Calculator は各社の乗車券運賃を計算するインターフェースです
type Calculator interface {
	Calculate(params ticketdomain.TicketFareParams) (int, error)
}

// Registry は会社IDとCalculatorの対応を管理します。
// グローバル状態を持たないため、複数インスタンスの生成やテストでの差し替えが可能です。
type Registry struct {
	calcs map[domain.CompanyID]Calculator
}

// 各社ごとの Calculator 実装
type hokkaidoCalculator struct{}

func (c *hokkaidoCalculator) Calculate(params ticketdomain.TicketFareParams) (int, error) {
	return CalculateHokkaidoFare(params)
}

type eastCalculator struct{}

func (c *eastCalculator) Calculate(params ticketdomain.TicketFareParams) (int, error) {
	return CalculateEastFare(params)
}

type standardCalculator struct{}

func (c *standardCalculator) Calculate(params ticketdomain.TicketFareParams) (int, error) {
	return CalculateStandardFare(params)
}

type shikokuCalculator struct{}

func (c *shikokuCalculator) Calculate(params ticketdomain.TicketFareParams) (int, error) {
	return CalculateShikokuFare(params)
}

type kyushuCalculator struct{}

func (c *kyushuCalculator) Calculate(params ticketdomain.TicketFareParams) (int, error) {
	return CalculateKyushuFare(params)
}

// NewRegistry はデフォルトの Calculator を登録した Registry を作成します
func NewRegistry() *Registry {
	r := &Registry{
		calcs: make(map[domain.CompanyID]Calculator),
	}
	r.Register(domain.JRHokkaido, &hokkaidoCalculator{})
	r.Register(domain.JREast, &eastCalculator{})
	r.Register(domain.JRCentral, &standardCalculator{})
	r.Register(domain.JRWest, &standardCalculator{})
	r.Register(domain.JRShikoku, &shikokuCalculator{})
	r.Register(domain.JRKyushu, &kyushuCalculator{})
	return r
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
