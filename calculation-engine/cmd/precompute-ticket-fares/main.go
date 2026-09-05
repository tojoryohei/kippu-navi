package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"os"
	"runtime"
	"sync"
	"sync/atomic"
	"math"

	"calculation-engine/internal/domain"
	ticketdomain "calculation-engine/internal/ticket/domain"
	ticketfare "calculation-engine/internal/ticket/fare"
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
	ticketgraphdata "calculation-engine/internal/graphdata"
)

func main() {
	if err := run(os.Args); err != nil {
		log.Fatalf("エラーが発生しました: %v", err)
	}
	log.Println("事前計算が完了しました。")
}

func run(args []string) error {
	if len(args) < 2 {
		return fmt.Errorf("使用法: precompute-ticket-fares <出力SERVER_BIN>")
	}

	outputServerBin := args[1]
	if outputServerBin == "--help" || outputServerBin == "-h" {
		return fmt.Errorf("使用法: precompute-ticket-fares <出力SERVER_BIN>")
	}

	log.Printf("乗車券グラフを読み込んでいます...")
	ticketLoader := &ticketgraphio.JSONLoader{}
	_, ticketFullGraph, err := ticketLoader.LoadSeparatedGraphs(
		[]io.Reader{ticketgraphdata.GetEdgesReader()},
		[]io.Reader{},
	)
	if err != nil {
		return fmt.Errorf("JSONの読み込みに失敗しました: %w", err)
	}

	ticketZoneRoutes, err := ticketdomain.LoadZoneRoutes("./internal/graphdata/zone_routes.json")
	if err != nil {
		return fmt.Errorf("乗車券の特例ゾーンルートロードに失敗しました: %w", err)
	}

	arBytes, err := io.ReadAll(ticketgraphdata.GetArticle70RoutesReader())
	if err != nil {
		return fmt.Errorf("article70Routesの読み込みに失敗しました: %w", err)
	}
	ticketArticle70Routes, err := ticketdomain.LoadArticle70RoutesFromBytes(arBytes)
	if err != nil {
		return fmt.Errorf("article70Routesのパースに失敗しました: %w", err)
	}

	ticketZoneReg, err := ticketgraphio.LoadSpecialZones()
	if err != nil {
		return fmt.Errorf("乗車券の特例ゾーンロードに失敗しました: %w", err)
	}

	for _, z := range ticketZoneReg.Zones {
		ticketFullGraph.GetOrAddID(z.Name)
	}
	numStations := ticketFullGraph.NumStations()
	log.Printf("駅数 = %d (ゾーン含む)", numStations)

	ticketFareReg := ticketfare.NewRegistry()
	
	// Create O(1) map for stationID -> centerStationID
	stationToCenterID := make([]int, numStations)
	for i := range stationToCenterID {
		stationToCenterID[i] = -1 // -1 means no special zone / center station
	}
	for _, z := range ticketZoneReg.Zones {
		centerName, ok := ticketgraphio.ZoneCenterStations[z.Name]
		if !ok {
			continue
		}
		centerID, ok := ticketFullGraph.GetID(centerName)
		if !ok {
			continue
		}
		for _, stationName := range z.Stations {
			stationID, ok := ticketFullGraph.GetID(stationName)
			if ok {
				stationToCenterID[stationID] = centerID
			}
		}
	}

	ticketFareioReg, err := ticketfareio.NewRegistry()
	if err != nil {
		return fmt.Errorf("乗車券のfareioロードに失敗しました: %w", err)
	}

	ticketSpecificMatcher := ticketfare.NewPathMatcher()
	for _, f := range ticketFareioReg.GetSpecificFares() {
		ids := make([]int, 0, len(f.Path))
		for _, name := range f.Path {
			id, ok := ticketFullGraph.GetID(name)
			if ok {
				ids = append(ids, id)
			}
		}
		if len(ids) == len(f.Path) {
			if err := ticketSpecificMatcher.Insert(ids, f.Fare); err != nil {
				panic(fmt.Sprintf("特定運賃の登録に失敗しました (経路: %v): %v", f.Path, err))
			}
		}
	}

	ticketAdjustedMatcher := ticketfare.NewPathMatcher()
	for _, f := range ticketFareioReg.GetAdjustedFares() {
		ids := make([]int, 0, len(f.Path))
		for _, name := range f.Path {
			id, ok := ticketFullGraph.GetID(name)
			if ok {
				ids = append(ids, id)
			}
		}
		if len(ids) == len(f.Path) {
			if err := ticketAdjustedMatcher.Insert(ids, f.Fare); err != nil {
				panic(fmt.Sprintf("調整運賃の登録に失敗しました (経路: %v): %v", f.Path, err))
			}
		}
	}

	ticketAddonFareReg := ticketfare.NewAddonRegistry()
	ticketAddonFareReg.Register("南千歳", "新千歳空港", 20)
	ticketAddonFareReg.Register("日根野", "りんくうタウン", 150)
	ticketAddonFareReg.Register("りんくうタウン", "関西空港", 170)
	ticketAddonFareReg.Register("日根野", "関西空港", 220)
	ticketAddonFareReg.Register("児島", "宇多津", 110)
	ticketAddonFareReg.Register("田吉", "宮崎空港", 130)

	if err := ticketAddonFareReg.ResolveIDs(func(name string) (int, bool) {
		return ticketFullGraph.GetID(name)
	}); err != nil {
		return fmt.Errorf("乗車券の加算運賃ID解決に失敗しました: %w", err)
	}

	ticketPrivateFareReg, err := ticketfareio.NewPrivateFareRegistry()
	if err != nil {
		return fmt.Errorf("私鉄運賃データの読み込みに失敗しました: %w", err)
	}

	ticketTrainSpecificCalc := ticketfare.NewTrainSpecificSectionCalculator()

	ticketAmountCalc := ticketusecase.NewCalculateAmount(
		ticketFareReg,
		ticketAddonFareReg,
		ticketTrainSpecificCalc,
		ticketSpecificMatcher,
		ticketAdjustedMatcher,
		ticketPrivateFareReg,
		ticketFullGraph,
		ticketZoneRoutes,
		ticketArticle70Routes,
	)

	ticketApplier := ticketusecase.NewSpecialZoneApplier(ticketFullGraph, ticketZoneReg)
	ticketSegmentEvaluator := ticketusecase.NewTicketSegmentEvaluator(
		ticketAmountCalc,
		ticketApplier,
		ticketusecase.NewPostZoneCleanupCorrector(),
		ticketZoneReg,
		ticketFullGraph,
	)

	log.Println("全点対最短経路（ベース）を事前計算しています...")
	basePrevGisei := make([][]int, numStations)
	baseDistGisei := make([][]domain.DeciKilo, numStations)
	basePrevEigyo := make([][]int, numStations)
	baseDistEigyo := make([][]domain.DeciKilo, numStations)

	var wg sync.WaitGroup
	
	// Reduce concurrency to avoid OOM killer during 4-hour run
	numWorkers := 2
	sem := make(chan struct{}, numWorkers)

	for i := 0; i < numStations; i++ {
		if i >= len(ticketFullGraph.Edges) || len(ticketFullGraph.Edges[i]) == 0 {
			continue
		}
		wg.Add(1)
		sem <- struct{}{}
		go func(startID int) {
			defer wg.Done()
			defer func() { <-sem }()
			
			dG, pG := ticketFullGraph.FindAllShortestPathsGisei(startID)
			basePrevGisei[startID] = pG
			baseDistGisei[startID] = dG

			dE, pE := ticketFullGraph.FindAllShortestPathsEigyo(startID)
			basePrevEigyo[startID] = pE
			baseDistEigyo[startID] = dE
		}(i)
	}
	wg.Wait()

	log.Println("運賃マトリクスを事前計算しています（並列処理）...")
	baseFares := make([]int32, numStations*numStations)
	for i := 0; i < numStations*numStations; i++ {
		baseFares[i] = math.MaxInt32
	}

	var wgFares sync.WaitGroup
	var completedCount int32
	
	for i := 0; i < numStations; i++ {
		if i >= len(ticketFullGraph.Edges) || len(ticketFullGraph.Edges[i]) == 0 {
			continue
		}
		wgFares.Add(1)
		sem <- struct{}{}
		go func(startID int) {
			defer wgFares.Done()
			defer func() { <-sem }()

			for endID := 0; endID < numStations; endID++ {
				if startID == endID {
					continue
				}
				if basePrevGisei[startID] == nil || basePrevGisei[startID][endID] == -1 {
					continue
				}

				// 1. 最短擬制キロ経路の復元と評価
				pathGisei := []int{}
				curr := endID
				for curr != -1 && curr != startID {
					pathGisei = append([]int{curr}, pathGisei...)
					curr = basePrevGisei[startID][curr]
				}
				if curr == startID {
					pathGisei = append([]int{startID}, pathGisei...)
				}

				minFare := math.MaxInt32
				if len(pathGisei) > 0 {
					res, _, err := ticketSegmentEvaluator.Execute(pathGisei, 0)
					if err == nil && res != nil {
						minFare = res.TotalAmount()
					}
				}

				// 2. 最短営業キロ経路の復元と評価
				if basePrevEigyo[startID] != nil && basePrevEigyo[startID][endID] != -1 {
					pathEigyo := []int{}
					currE := endID
					for currE != -1 && currE != startID {
						pathEigyo = append([]int{currE}, pathEigyo...)
						currE = basePrevEigyo[startID][currE]
					}
					if currE == startID {
						pathEigyo = append([]int{startID}, pathEigyo...)
					}
					if len(pathEigyo) > 0 {
						resE, _, err := ticketSegmentEvaluator.Execute(pathEigyo, 0)
						if err == nil && resE != nil {
							if resE.TotalAmount() < minFare {
								minFare = resE.TotalAmount()
							}
						}
					}
				}
				if minFare != math.MaxInt32 {
					idx := int32(startID)*int32(numStations) + int32(endID)
					baseFares[idx] = int32(minFare)
				}
			}
			
			current := atomic.AddInt32(&completedCount, 1)
			if current%50 == 0 {
				log.Printf("進行状況: %d/%d 駅完了", current, numStations)
				runtime.GC() // Force GC to prevent OOM
			}
		}(i)
	}
	wgFares.Wait()

	log.Printf("サーバー用バイナリファイルを書き出しています: %s", outputServerBin)
	outServerFile, err := os.Create(outputServerBin)
	if err != nil {
		return fmt.Errorf("出力SERVER_BINファイルの作成に失敗しました: %w", err)
	}
	defer outServerFile.Close()

	magic := [8]byte{'T', 'K', 'S', 'R', 'V', 'B', 0, 0}
	if _, err := outServerFile.Write(magic[:]); err != nil {
		return fmt.Errorf("Magicの書き込みに失敗しました: %w", err)
	}

	if err := binary.Write(outServerFile, binary.LittleEndian, int32(numStations)); err != nil {
		return fmt.Errorf("駅数の書き込みに失敗しました: %w", err)
	}

	padding := [4]byte{0, 0, 0, 0}
	if _, err := outServerFile.Write(padding[:]); err != nil {
		return fmt.Errorf("Paddingの書き込みに失敗しました: %w", err)
	}

	if err := binary.Write(outServerFile, binary.LittleEndian, baseFares); err != nil {
		return fmt.Errorf("BaseFaresの書き込みに失敗しました: %w", err)
	}

	return nil
}
