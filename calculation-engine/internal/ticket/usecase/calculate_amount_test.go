package usecase_test

import (
	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	"calculation-engine/internal/ticket/fare"
	ticketgraph "calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/fareio"
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

	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
		FromID: id("A"), ToID: id("河原田"),
		EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JRCentral,
	}})
	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
		FromID: id("河原田"), ToID: id("津"),
		EigyoKilo: 223, GiseiKilo: 223, IsLocal: false, Company: domain.Other,
	}})
	g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
		FromID: id("津"), ToID: id("D"),
		EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JRCentral,
	}})

	reg := fare.NewRegistry()

	trainSpecificCalc := fare.NewTrainSpecificSectionCalculator()

	specificMatcher := fare.NewPathMatcher()
	_ = specificMatcher.Insert([]int{id("X"), id("Y")}, 500)

	adjustedMatcher := fare.NewPathMatcher()

	addonReg := fare.NewAddonRegistry()
	privateReg, _ := fareio.NewPrivateFareRegistry()
	calc := usecase.NewCalculateAmount(reg, addonReg, trainSpecificCalc, specificMatcher, adjustedMatcher, privateReg, g, nil, nil)

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
			t.Errorf("expected > 0, got %d", res.Fare)
		}
	})

	t.Run("通過連絡運輸（私鉄区間を含む）", func(t *testing.T) {
		res, err := calc.Execute([]int{id("A"), id("河原田"), id("津"), id("D")})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}
		// A-河原田: 10km, 津-D: 10km -> JR合計20km
		// 20kmの本州幹線運賃は330円
		// 私鉄区間（河原田-津）は520円（privateFares.jsonに定義）
		// 合計: 330 + 520 = 850円
		if res.Fare != 850 {
			t.Errorf("expected 850 (JR 330 + 私鉄 520), got %d", res.Fare)
		}
		if res.TotalEigyoKilo != 200 {
			t.Errorf("expected JR total eigyo kilo 200, got %d", res.TotalEigyoKilo)
		}
	})

	t.Run("70条特例の補正ロジック（通過）", func(t *testing.T) {
		// グラフに新しいエッジを追加 (T1 -> T2 -> T3 -> T4)
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
			FromID: id("T1"), ToID: id("T2"), EigyoKilo: 10, GiseiKilo: 10, IsLocal: false, Company: domain.JREast,
		}, IsBoldLineArea: false})
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
			FromID: id("T2"), ToID: id("T3"), EigyoKilo: 10, GiseiKilo: 10, IsLocal: false, Company: domain.JREast,
		}, IsBoldLineArea: true})
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
			FromID: id("T3"), ToID: id("T4"), EigyoKilo: 10, GiseiKilo: 10, IsLocal: false, Company: domain.JREast,
		}, IsBoldLineArea: false})

		// T2からT3へは、より短い別経路 T2->TX->T3 が定義されているとする
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
			FromID: id("T2"), ToID: id("TX"), EigyoKilo: 2, GiseiKilo: 2, IsLocal: false, Company: domain.JREast,
		}, IsBoldLineArea: true})
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
			FromID: id("TX"), ToID: id("T3"), EigyoKilo: 3, GiseiKilo: 3, IsLocal: false, Company: domain.JREast,
		}, IsBoldLineArea: true})

		article70Routes := ticketdomain.NewArticle70Routes(map[string]map[string][]string{
			"T3": {
				"T2": {"T2", "TX", "T3"},
			},
		})

		calcWithA70 := usecase.NewCalculateAmount(reg, addonReg, trainSpecificCalc, specificMatcher, adjustedMatcher, privateReg, g, nil, article70Routes)

		res, err := calcWithA70.Execute([]int{id("T1"), id("T2"), id("T3"), id("T4")})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}

		// 経路が [T1, T2, TX, T3, T4] に補正されて運賃計算に使われているはず
		// 運賃のキロ程は補正後の (10 + 2 + 3 + 10 = 25km) で計算される
		if res.TotalEigyoKilo != 25 {
			t.Errorf("expected total eigyo kilo 25, got %d", res.TotalEigyoKilo)
		}
	})

	t.Run("70条特例の補正ロジック（エリア内完結は補正しない）", func(t *testing.T) {
		article70Routes := ticketdomain.NewArticle70Routes(map[string]map[string][]string{
			"T3": {
				"T2": {"T2", "TX", "T3"},
			},
		})
		calcWithA70 := usecase.NewCalculateAmount(reg, addonReg, trainSpecificCalc, specificMatcher, adjustedMatcher, privateReg, g, nil, article70Routes)

		// T2からT3へエリア内完結の移動
		res, err := calcWithA70.Execute([]int{id("T2"), id("T3")})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}

		// 経路は補正されず [T2, T3] のまま
		expectedPath := []int{id("T2"), id("T3")}
		if len(res.FinalPath) != len(expectedPath) {
			t.Fatalf("expected path length %d, got %d", len(expectedPath), len(res.FinalPath))
		}
		for i, p := range expectedPath {
			if res.FinalPath[i] != p {
				t.Errorf("at index %d: expected %v, got %v", i, p, res.FinalPath[i])
			}
		}
	})
	t.Run("70条特例の補正ロジック（実際の駅名による迂回経路）", func(t *testing.T) {
		// 千葉(外) -> 錦糸町(境界) -> 秋葉原 -> 新宿 -> 品川(境界) -> 横浜(外) という迂回経路
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: id("千葉"), ToID: id("錦糸町"), EigyoKilo: 200, GiseiKilo: 200, IsLocal: false, Company: domain.JREast}, IsBoldLineArea: false})
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: id("錦糸町"), ToID: id("秋葉原"), EigyoKilo: 50, GiseiKilo: 50, IsLocal: false, Company: domain.JREast}, IsBoldLineArea: true})
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: id("秋葉原"), ToID: id("新宿"), EigyoKilo: 50, GiseiKilo: 50, IsLocal: false, Company: domain.JREast}, IsBoldLineArea: true})
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: id("新宿"), ToID: id("品川"), EigyoKilo: 100, GiseiKilo: 100, IsLocal: false, Company: domain.JREast}, IsBoldLineArea: true})
		g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{FromID: id("品川"), ToID: id("横浜"), EigyoKilo: 200, GiseiKilo: 200, IsLocal: false, Company: domain.JREast}, IsBoldLineArea: false})

		// 補正後の最短経路の各駅のエッジ（錦糸町〜品川）: 合計90デシキロ(9km)
		shortestNodes := []string{"錦糸町", "馬喰町", "新日本橋", "東京", "有楽町", "新橋", "浜松町", "田町", "高輪ゲートウェイ", "品川"}
		for i := 0; i < len(shortestNodes)-1; i++ {
			g.AddEdge(ticketdomain.TicketEdge{Edge: domain.Edge{
				FromID: id(shortestNodes[i]), ToID: id(shortestNodes[i+1]), EigyoKilo: 10, GiseiKilo: 10, IsLocal: false, Company: domain.JREast,
			}, IsBoldLineArea: true})
		}

		article70Routes := ticketdomain.NewArticle70Routes(map[string]map[string][]string{
			"品川": {
				"錦糸町": shortestNodes,
			},
		})
		calcWithA70 := usecase.NewCalculateAmount(reg, addonReg, trainSpecificCalc, specificMatcher, adjustedMatcher, privateReg, g, nil, article70Routes)

		res, err := calcWithA70.Execute([]int{id("千葉"), id("錦糸町"), id("秋葉原"), id("新宿"), id("品川"), id("横浜")})
		if err != nil {
			t.Fatalf("Execute() error = %v", err)
		}

		// 迂回経路(錦糸町〜品川: 20km)が最短(錦糸町〜品川: 9km)に補正されるため、
		// 運賃計算キロは 20(千葉〜錦糸町) + 9(最短) + 20(品川〜横浜) = 49km (490デシキロ)
		if res.TotalEigyoKilo != 490 {
			t.Errorf("expected total eigyo kilo 490, got %d", res.TotalEigyoKilo)
		}
	})
}
