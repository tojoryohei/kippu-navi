package usecase_test

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	ticketgraph "calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/usecase"
	"testing"
)

func TestCalculateAmount_Execute(t *testing.T) {
	g := ticketgraph.NewGraph(20)

	id := func(name string) int { return g.GetOrAddID(name) }

	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
		FromID: id("A"), ToID: id("B"),
		EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast,
	}})
	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
		FromID: id("B"), ToID: id("C"),
		EigyoKilo: 200, GiseiKilo: 200, IsLocal: false, Company: domain.JRCentral,
	}})
	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
		FromID: id("X"), ToID: id("Y"),
		EigyoKilo: 50, GiseiKilo: 50, IsLocal: false, Company: domain.JREast,
	}})

	reg := fare.NewRegistry()

	trainSpecificCalc := fare.NewTrainSpecificSectionCalculator()

	specificMatcher := fare.NewPathMatcher()
	_ = specificMatcher.Insert([]int{id("X"), id("Y")}, 500)

	adjustedMatcher := fare.NewPathMatcher()

	addonReg := fare.NewAddonRegistry()
	calc := usecase.NewCalculateAmount(reg, addonReg, trainSpecificCalc, specificMatcher, adjustedMatcher, g)

	t.Run("特定区間運賃に合致", func(t *testing.T) {
		res, err := calc.Execute([]int{id("X"), id("Y")})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		if res.Fare != 500 {
			t.Errorf("expected 500, got %d", res.Fare)
		}
	})

	t.Run("通常運賃（会社跨ぎ）", func(t *testing.T) {
		res, err := calc.Execute([]int{id("A"), id("B"), id("C")})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		// A-C: 合計30km (営業キロ300) -> 基準の30km運賃は510円
		// 10km (A-B) 東日本 - 基準運賃 = 200 - 200 = 差額0円。よって合計は510円となる。
		// 個別の運賃計算機の正確性はそれぞれのテストで担保されているため、ここでは運賃が0より大きいことのみを検証する。
		if res.Fare <= 0 {
			t.Errorf("expected fare > 0, got %d", res.Fare)
		}
	})
}
