package usecase

import (
	"reflect"
	"testing"

	"calculation-engine/internal/ticket/graph"
	"calculation-engine/internal/ticket/infra/graphio"
)

func TestSpecialFareRuleResolverUncorrectKeepsInputPath(t *testing.T) {
	g := graph.NewGraph(4)
	startID := g.GetOrAddID("大阪市内")
	middleID := g.GetOrAddID("新大阪")
	endID := g.GetOrAddID("新神戸")
	input := []int{startID, middleID, endID}

	resolver := &SpecialFareRuleResolver{
		osakaCityCorrector: preOsakaCorrector{},
		graph:              g,
		zoneRegistry:       &graphio.SpecialZoneRegistry{},
	}
	got, err := resolver.Resolve(input, "uncorrect")
	if err != nil {
		t.Fatalf("補正禁止モードの解決に失敗しました: %v", err)
	}
	if len(got) != 1 || !reflect.DeepEqual(got[0].Path, input) {
		t.Fatalf("補正禁止モードで経路が変更されました: %+v", got)
	}
}

func TestSpecialFareRuleResolverUncorrectAppliesArticle88(t *testing.T) {
	g := &mockGraphCorrector{
		names: map[int]string{
			1: "大阪",
			2: "姫路",
			3: "大阪・新大阪",
		},
	}
	resolver := &SpecialFareRuleResolver{
		zoneRegistry: &graphio.SpecialZoneRegistry{},
		graph:        g,
	}

	candidates, err := resolver.Resolve([]int{1, 2}, "uncorrect")
	if err != nil {
		t.Fatalf("補正禁止モードの解決に失敗しました: %v", err)
	}
	if len(candidates) != 2 {
		t.Fatalf("第88条候補と入力経路の2候補を期待しました: %+v", candidates)
	}
	if want := []int{3, 1, 2}; !reflect.DeepEqual(candidates[0].Path, want) {
		t.Fatalf("補正禁止モードで第88条が適用されていません: got %v, want %v", candidates[0].Path, want)
	}
	if want := []int{1, 2}; !reflect.DeepEqual(candidates[1].Path, want) {
		t.Fatalf("第88条候補の後に入力経路へ戻りません: got %v, want %v", candidates[1].Path, want)
	}
}

type preOsakaCorrector struct{}

func (preOsakaCorrector) Correct(_ []int, _ graph.Graph) ([]int, error) {
	// 大阪市内の事後補正を表すテスト用の変換。第88条がこの変換後の
	// 経路に対して評価されることを確認する。
	return []int{3, 4}, nil
}

func TestSpecialFareRuleResolverAppliesOsakaCityCorrectionBeforeArticle88(t *testing.T) {
	g := &mockGraphCorrector{
		names: map[int]string{
			1: "入力発駅",
			2: "入力着駅",
			3: "大阪",
			4: "姫路",
			5: "大阪・新大阪",
		},
	}
	resolver := &SpecialFareRuleResolver{
		osakaCityCorrector: preOsakaCorrector{},
		zoneRegistry:       &graphio.SpecialZoneRegistry{},
		graph:              g,
	}

	candidates, err := resolver.Resolve([]int{1, 2}, "normal")
	if err != nil {
		t.Fatalf("通常モードの解決に失敗しました: %v", err)
	}
	if len(candidates) < 2 {
		t.Fatalf("第88条候補が生成されませんでした: %+v", candidates)
	}

	wantArticle88Path := []int{5, 3, 4}
	if !reflect.DeepEqual(candidates[0].Path, wantArticle88Path) {
		t.Fatalf("事後補正後に第88条が適用されていません: got %v, want %v", candidates[0].Path, wantArticle88Path)
	}
}
