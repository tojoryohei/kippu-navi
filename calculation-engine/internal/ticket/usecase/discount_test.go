package usecase

import (
	"calculation-engine/internal/domain"
	"testing"
)

// 期待値は実装側の定義・計算関数から生成せず、仕様の割引率で固定する。
func TestTicketDiscountRules(t *testing.T) {
	for _, tc := range []struct {
		id      string
		company domain.CompanyID
		want    int
	}{
		{"student", domain.JREast, 1720},
		{"zipangu20", domain.JRKyushu, 1720},
		{"zipangu30", domain.JRShikoku, 1590},
		{"disability", domain.JREast, 1350},
		{"otona05", domain.JRHokkaido, 1900},
		{"otona30", domain.JREast, 1590},
		{"east40", domain.JREast, 1470},
		{"central10", domain.JRCentral, 1840},
		{"central20", domain.JRCentral, 1720},
		{"west50", domain.JRWest, 1350},
	} {
		t.Run(tc.id, func(t *testing.T) {
			base := &CalculationResult{JRFare: 1230, BarrierFreeFee: 10, PrivateFareAmounts: []int{230, 500}, JRCompanies: []domain.CompanyID{tc.company}, TotalEigyoKilo: 1001}
			got := (TicketPricingOptions{PassengerType: "adult", DiscountID: tc.id}).price(base)
			if got.TotalAmount() != tc.want || !got.DiscountApplied {
				t.Fatalf("結果=%+v、期待値=%d", got, tc.want)
			}
		})
	}
}

func TestTicketDiscountCompanyAndRounding(t *testing.T) {
	for _, tc := range []struct {
		name    string
		base    CalculationResult
		options TicketPricingOptions
		want    int
		applied bool
	}{
		{"小児はJR料金込み・私鉄会社別に端数処理", CalculationResult{JRFare: 1230, BarrierFreeFee: 10, PrivateFareAmounts: []int{230, 500}, JRCompanies: []domain.CompanyID{domain.JREast}}, TicketPricingOptions{"child", "none"}, 980, false},
		{"小児端数処理後に身障", CalculationResult{JRFare: 1390, TotalEigyoKilo: 1001, JRCompanies: []domain.CompanyID{domain.JREast}}, TicketPricingOptions{"child", "disability"}, 340, true},
		{"私鉄は学割距離に含めない", CalculationResult{JRFare: 1400, PrivateFareAmounts: []int{500}, TotalEigyoKilo: 1000, TotalPathEigyoKilo: 1500, JRCompanies: []domain.CompanyID{domain.JREast}}, TicketPricingOptions{"adult", "student"}, 1900, false},
		{"西日本と私鉄", CalculationResult{JRFare: 1400, PrivateFareAmounts: []int{500}, JRCompanies: []domain.CompanyID{domain.JRWest}}, TicketPricingOptions{"adult", "west50"}, 1200, true},
		{"対象外JR混在", CalculationResult{JRFare: 1400, JRCompanies: []domain.CompanyID{domain.JRWest, domain.JRCentral}}, TicketPricingOptions{"adult", "west50"}, 1400, false},
		{"JRなし", CalculationResult{PrivateFareAmounts: []int{500}}, TicketPricingOptions{"child", "west50"}, 250, false},
		{"北海道と東日本", CalculationResult{JRFare: 3000, TotalEigyoKilo: 1001, JRCompanies: []domain.CompanyID{domain.JRHokkaido, domain.JREast}}, TicketPricingOptions{"adult", "otona05"}, 2850, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got := tc.options.price(&tc.base)
			if got.TotalAmount() != tc.want || got.DiscountApplied != tc.applied {
				t.Fatalf("結果=%+v、期待値=%d", got, tc.want)
			}
		})
	}
}
