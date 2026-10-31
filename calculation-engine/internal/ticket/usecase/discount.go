package usecase

import (
	"calculation-engine/internal/domain"
	"fmt"
)

// TicketPricingOptions は乗車券の運賃・経路指定分割計算で使用する年齢区分と割引。
// 未指定の既存呼び出しは大人・割引なしとなる。
type TicketPricingOptions struct {
	PassengerType string `json:"passengerType"`
	DiscountID    string `json:"discountId"`
}

type TicketDiscount struct {
	ID           string
	Name         string
	Companies    []domain.CompanyID
	Percent      int
	MinEigyoKilo domain.DeciKilo // この値を超えた場合に適用。0は距離条件なし。
	AllowChild   bool
}

var allJRCompanies = []domain.CompanyID{domain.JRHokkaido, domain.JREast, domain.JRCentral, domain.JRWest, domain.JRShikoku, domain.JRKyushu}

var TicketDiscounts = []TicketDiscount{
	{"student", "学割", allJRCompanies, 20, 1000, false},
	{"zipangu20", "ジパング2割", allJRCompanies, 20, 1000, false},
	{"zipangu30", "ジパング3割", allJRCompanies, 30, 1000, false},
	{"disability", "身障（単独）", allJRCompanies, 50, 1000, true},
	{"otona05", "大人休日05", []domain.CompanyID{domain.JRHokkaido, domain.JREast}, 5, 1000, false},
	{"otona30", "大人休日30", []domain.CompanyID{domain.JRHokkaido, domain.JREast}, 30, 1000, false},
	{"east40", "東優4割", []domain.CompanyID{domain.JREast}, 40, 0, true},
	{"central10", "海優1割", []domain.CompanyID{domain.JRCentral}, 10, 0, true},
	{"central20", "海優2割", []domain.CompanyID{domain.JRCentral}, 20, 0, true},
	{"west50", "西優5割", []domain.CompanyID{domain.JRWest}, 50, 0, true},
}

func (o TicketPricingOptions) Normalize() (TicketPricingOptions, error) {
	if o.PassengerType == "" {
		o.PassengerType = "adult"
	}
	if o.DiscountID == "" {
		o.DiscountID = "none"
	}
	if o.PassengerType != "adult" && o.PassengerType != "child" {
		return o, fmt.Errorf("不明な年齢区分です: %s", o.PassengerType)
	}
	if o.DiscountID != "none" {
		d := o.discount()
		if d == nil {
			return o, fmt.Errorf("不明な割引です: %s", o.DiscountID)
		}
		if o.PassengerType == "child" && !d.AllowChild {
			o.DiscountID = "none"
		}
	}
	return o, nil
}

func (o TicketPricingOptions) discount() *TicketDiscount {
	for i := range TicketDiscounts {
		if TicketDiscounts[i].ID == o.DiscountID {
			return &TicketDiscounts[i]
		}
	}
	return nil
}

func (d *TicketDiscount) allows(companies []domain.CompanyID) bool {
	if len(companies) == 0 {
		return false
	}
	for _, c := range companies {
		allowed := false
		for _, target := range d.Companies {
			if c == target {
				allowed = true
				break
			}
		}
		if !allowed {
			return false
		}
	}
	return true
}

// price は新しい結果を返し、キャッシュされた基準運賃を書き換えない。
func (o TicketPricingOptions) price(base *CalculationResult) *CalculationResult {
	res := *base
	jr := base.JRFare + base.BarrierFreeFee
	private := 0
	if o.PassengerType == "child" {
		jr = jr / 20 * 10
	}
	for _, amount := range base.PrivateFareAmounts {
		if o.PassengerType == "child" {
			amount = amount / 20 * 10
		}
		private += amount
	}
	if d := o.discount(); d != nil && d.allows(base.JRCompanies) && (d.MinEigyoKilo == 0 || base.TotalEigyoKilo > d.MinEigyoKilo) {
		jr = jr * (100 - d.Percent) / 1000 * 10
		res.DiscountApplied = true
	}
	res.Fare = jr + private
	// 料金は上記で合算・端数整理済み。TotalAmountで二重加算しない。
	res.BarrierFreeFee = 0
	return &res
}
