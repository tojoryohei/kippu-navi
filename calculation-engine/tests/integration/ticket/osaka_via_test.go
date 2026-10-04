package ticket_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"slices"
	"testing"

	"calculation-engine/internal/ticket/handler"
	"calculation-engine/internal/ticket/infra/graphio"
	"calculation-engine/internal/ticket/usecase"
)

func TestOsakaShinkansenFareViaResponse(t *testing.T) {
	calc, g := setupTicketAmount(t)
	zones, err := graphio.LoadSpecialZones()
	if err != nil {
		t.Fatal(err)
	}
	evaluator := usecase.NewTicketSegmentEvaluator(calc, usecase.NewSpecialZoneApplier(g, zones), usecase.NewPostZoneCleanupCorrector(), zones, g)
	fareEval := func(path []int) (int, error) {
		result, _, err := evaluator.ExecuteWithMode(path, 0, "normal")
		if err != nil {
			return 0, err
		}
		return result.TotalAmount(), nil
	}
	corrector := usecase.NewPipelineCorrector(usecase.NewSuburbanAreaCorrector(fareEval), usecase.NewShinkansenOverlapCorrector(), usecase.NewRule43_2Corrector(), usecase.NewRule69Corrector(), usecase.NewRule157Corrector())
	h := handler.NewTicketWithRouteExtensionsAndZones(g, corrector, evaluator, nil, zones)
	type segment struct {
		line     string
		stations []string
	}
	for _, tt := range []struct {
		name     string
		segments []segment
		want     handler.KippuData
	}{
		{
			name: "新大阪発で姫路まで新幹線",
			segments: []segment{
				{"シンカ", []string{"新大阪", "新神戸", "西明石", "姫路"}},
			},
			want: handler.KippuData{TotalEigyoKilo: 879, DepartureStation: "大阪・新大阪", ArrivalStation: "姫路", PrintedViaLines: []string{"東海道", "山陽", "西明石", "新幹線", "姫路"}, Fare: 1460, ValidDays: 1},
		},
		{
			name: "姫路まで新幹線",
			segments: []segment{
				{"トウカ", []string{"大阪", "新大阪"}},
				{"シンカ", []string{"新大阪", "新神戸", "西明石", "姫路"}},
			},
			want: handler.KippuData{TotalEigyoKilo: 879, DepartureStation: "大阪・新大阪", ArrivalStation: "姫路", PrintedViaLines: []string{"東海道", "山陽", "西明石", "新幹線", "姫路"}, Fare: 1460, ValidDays: 1},
		},
		{
			name: "西明石から尼崎経由で丹波竹田",
			segments: []segment{
				{"トウカ", []string{"大阪", "新大阪"}},
				{"シンカ", []string{"新大阪", "新神戸", "西明石"}},
				{"サンヨ", []string{"西明石", "明石", "朝霧", "舞子", "垂水", "塩屋", "須磨", "須磨海浜公園", "鷹取", "新長田", "兵庫", "神戸"}},
				{"トウカ", []string{"神戸", "元町", "三ノ宮", "灘", "摩耶", "六甲道", "（東）住吉", "摂津本山", "甲南山手", "芦屋", "さくら夙川", "西宮", "甲子園口", "立花", "尼崎"}},
				{"フクチ", []string{"尼崎", "塚口", "猪名寺", "伊丹", "北伊丹", "川西池田", "中山寺", "宝塚", "生瀬", "西宮名塩", "武田尾", "道場", "三田", "新三田", "（福）広野", "相野", "藍本", "（福）草野", "古市", "南矢代", "篠山口", "丹波大山", "下滝", "谷川", "（福）柏原", "石生", "（福）黒井", "市島", "丹波竹田"}},
			},
			want: handler.KippuData{TotalEigyoKilo: 2023, DepartureStation: "大阪市内", ArrivalStation: "丹波竹田", PrintedViaLines: []string{"新大阪", "新幹線", "西明石", "山陽", "東海道", "福知山線"}, Fare: 3740, ValidDays: 3},
		},
	} {
		for _, reverse := range []bool{false, true} {
			name := tt.name + "/往路"
			if reverse {
				name = tt.name + "/復路"
			}
			t.Run(name, func(t *testing.T) {
				var names, lines []string
				for _, segment := range tt.segments {
					for _, station := range segment.stations[:len(segment.stations)-1] {
						names = append(names, station)
						lines = append(lines, segment.line)
					}
				}
				last := tt.segments[len(tt.segments)-1].stations
				names = append(names, last[len(last)-1])
				want := tt.want
				want.PrintedViaLines = slices.Clone(want.PrintedViaLines)
				if reverse {
					slices.Reverse(names)
					slices.Reverse(lines)
					want.DepartureStation, want.ArrivalStation = want.ArrivalStation, want.DepartureStation
					slices.Reverse(want.PrintedViaLines)
				}
				request := handler.RouteRequest{CalculationMode: "normal"}
				for i, station := range names {
					step := handler.PathStep{StationName: station}
					if i < len(lines) {
						step.LineName = &lines[i]
					}
					request.FullPath = append(request.FullPath, step)
				}
				body, err := json.Marshal(request)
				if err != nil {
					t.Fatal(err)
				}
				recorder := httptest.NewRecorder()
				h.HandleCalculateFare(recorder, httptest.NewRequest(http.MethodPost, "/api/fare/ticket", bytes.NewReader(body)))
				if recorder.Code != http.StatusOK {
					t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body)
				}
				var response handler.RouteResponse
				if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(response.Data, want) {
					t.Fatalf("response=%+v; want=%+v", response.Data, want)
				}
			})
		}
	}
}
