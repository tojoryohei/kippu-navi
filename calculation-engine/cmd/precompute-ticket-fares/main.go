package main

import (
	"encoding/binary"
	"fmt"
	"io"
	"log"
	"math"
	"os"
	"runtime"
	"sync"
	"sync/atomic"

	"calculation-engine/internal/domain"
	ticketgraphdata "calculation-engine/internal/graphdata"
	ticketdata "calculation-engine/internal/ticket/data"
	ticketdomain "calculation-engine/internal/ticket/domain"
	ticketfare "calculation-engine/internal/ticket/fare"
	ticketgraph "calculation-engine/internal/ticket/graph"
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
)

func main() {
	if err := run(os.Args); err != nil {
		log.Fatalf("エラーが発生しました: %v", err)
	}
	log.Println("事前計算が完了しました。")
}

func run(args []string) (runErr error) {
	if len(args) < 2 {
		return fmt.Errorf("使用法: precompute-ticket-fares <出力SERVER_BIN>")
	}

	outputServerBin := args[1]
	if outputServerBin == "--help" || outputServerBin == "-h" {
		return fmt.Errorf("使用法: precompute-ticket-fares <出力SERVER_BIN>")
	}

	log.Printf("乗車券グラフを読み込んでいます...")
	ticketLoader := &ticketgraphio.JSONLoader{}
	ticketSearchGraph, ticketFullGraph, err := ticketLoader.LoadSeparatedGraphs(
		[]io.Reader{ticketgraphdata.GetEdgesReader()},
		ticketgraphdata.GetFareGraphEdgeReaders(),
	)
	if err != nil {
		return fmt.Errorf("JSONの読み込みに失敗しました: %w", err)
	}

	ticketZoneRoutes, err := ticketdomain.LoadZoneRoutes("./internal/graphdata/zone_routes.json")
	if err != nil {
		return fmt.Errorf("乗車券の特例ゾーンルートロードに失敗しました: %w", err)
	}
	article70Bytes, err := io.ReadAll(ticketgraphdata.GetArticle70RoutesReader())
	if err != nil {
		return fmt.Errorf("article70Routesの読み込みに失敗しました: %w", err)
	}
	ticketArticle70Routes, err := ticketdomain.LoadArticle70RoutesFromBytes(article70Bytes)
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
	for _, zoneName := range ticketZoneRoutes.ZoneNames() {
		ticketFullGraph.GetOrAddID(zoneName)
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
	ticketAddonFareReg.Register("日根野", "りんくうタウン", 160)
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
	)

	ticketApplier := ticketusecase.NewSpecialZoneApplier(ticketFullGraph, ticketZoneReg)
	ticketSegmentEvaluator := ticketusecase.NewTicketSegmentEvaluator(
		ticketAmountCalc,
		ticketApplier,
		ticketusecase.NewPostZoneCleanupCorrector(),
		ticketZoneReg,
		ticketFullGraph,
	)
	fareEval := func(path []int) (int, error) {
		res, _, err := ticketSegmentEvaluator.ExecuteWithMode(path, 0, "normal")
		if err != nil {
			return 0, err
		}
		return res.TotalAmount(), nil
	}
	ticketCorrector := ticketusecase.NewPipelineCorrector(
		ticketusecase.NewSuburbanAreaCorrector(fareEval),
		ticketusecase.NewShinkansenOverlapCorrector(),
		ticketusecase.NewRule43_2Corrector(),
		ticketusecase.NewRule69Corrector(),
		ticketusecase.NewRule157Corrector(),
		ticketusecase.NewArticle70Corrector(ticketArticle70Routes),
	)

	log.Println("物理グラフの全点対最短経路を事前計算しています...")
	physicalDistGisei := make([]uint16, numStations*numStations)
	for i := range physicalDistGisei {
		physicalDistGisei[i] = math.MaxUint16
	}

	var wg sync.WaitGroup

	// 定期券側の事前計算と同じく、利用可能なCPUコアをすべて使う。
	numWorkers := runtime.NumCPU()
	log.Printf("並列ワーカー数: %d", numWorkers)
	sem := make(chan struct{}, numWorkers)
	var completedPaths int32

	for i := 0; i < numStations; i++ {
		wg.Add(1)
		sem <- struct{}{}
		go func(startID int) {
			defer wg.Done()
			defer func() { <-sem }()

			if startID >= len(ticketFullGraph.Edges) || len(ticketFullGraph.Edges[startID]) == 0 {
				current := atomic.AddInt32(&completedPaths, 1)
				if current%50 == 0 || current == int32(numStations) {
					log.Printf("経路計算: %d/%d 駅完了", current, numStations)
				}
				return
			}

			// 分割候補の経路探索には物理エッジだけを使う。
			dG, _ := ticketSearchGraph.FindAllShortestPathsGisei(startID)

			rowOffset := startID * numStations
			for endID, distance := range dG {
				if distance >= 0 && distance < domain.DeciKilo(math.MaxUint16) {
					physicalDistGisei[rowOffset+endID] = uint16(distance)
				}
			}

			current := atomic.AddInt32(&completedPaths, 1)
			if current%50 == 0 || current == int32(numStations) {
				log.Printf("経路計算: %d/%d 駅完了", current, numStations)
			}
		}(i)
	}
	wg.Wait()
	// 実行時と同じA*下界を使って、距離上限内の短い5経路を探索する。
	ticketSearchGraph.DistGisei = physicalDistGisei

	log.Println("運賃マトリクスを事前計算しています（並列処理）...")
	baseFares := make([]int32, numStations*numStations)
	for i := 0; i < numStations*numStations; i++ {
		baseFares[i] = math.MaxInt32
	}

	var wgFares sync.WaitGroup
	var completedCount int32
	totalFareTasks := int32(numStations)

	for i := 0; i < numStations; i++ {
		wgFares.Add(1)
		sem <- struct{}{}
		go func(startID int) {
			defer wgFares.Done()
			defer func() { <-sem }()

			if startID >= len(ticketFullGraph.Edges) || len(ticketFullGraph.Edges[startID]) == 0 {
				current := atomic.AddInt32(&completedCount, 1)
				if current%50 == 0 || current == totalFareTasks {
					log.Printf("運賃計算: %d/%d タスク完了", current, totalFareTasks)
				}
				return
			}

			search := ticketusecase.NewSearchOptimalSplit(ticketSearchGraph, ticketSegmentEvaluator, ticketZoneReg)
			search.SetPathCorrector(ticketCorrector)
			search.SetYenScratch(&ticketgraph.YenScratch{
				BlockedNodes:  make([]bool, numStations),
				Dist:          make([]domain.DeciKilo, numStations),
				EigyoDist:     make([]domain.DeciKilo, numStations),
				Prev:          make([]int, numStations),
				DistanceToEnd: make([]domain.DeciKilo, numStations),
			})
			for endID := 0; endID < numStations; endID++ {
				if startID == endID {
					continue
				}
				if physicalDistGisei[startID*numStations+endID] == math.MaxUint16 {
					continue
				}
				segments, err := search.GetCheapestTicketSegments(startID, endID)
				if err == nil && len(segments) > 0 && segments[0].Result != nil {
					idx := int32(startID)*int32(numStations) + int32(endID)
					baseFares[idx] = int32(segments[0].Result.TotalAmount())
				}
			}

			current := atomic.AddInt32(&completedCount, 1)
			if current%50 == 0 || current == totalFareTasks {
				log.Printf("運賃計算: %d/%d タスク完了", current, totalFareTasks)
			}
		}(i)
	}
	wgFares.Wait()

	log.Printf("サーバー用バイナリファイルを書き出しています: %s", outputServerBin)
	outServerFile, err := os.Create(outputServerBin)
	if err != nil {
		return fmt.Errorf("出力SERVER_BINファイルの作成に失敗しました: %w", err)
	}
	defer func() {
		if closeErr := outServerFile.Close(); closeErr != nil && runErr == nil {
			runErr = fmt.Errorf("出力SERVER_BINファイルのクローズに失敗しました: %w", closeErr)
		}
	}()

	if _, err := outServerFile.Write([]byte(ticketdata.TicketBinaryMagic)); err != nil {
		return fmt.Errorf("magicの書き込みに失敗しました: %w", err)
	}

	if err := binary.Write(outServerFile, binary.LittleEndian, int32(numStations)); err != nil {
		return fmt.Errorf("駅数の書き込みに失敗しました: %w", err)
	}

	if err := binary.Write(outServerFile, binary.LittleEndian, uint32(ticketdata.TicketSectionCount)); err != nil {
		return fmt.Errorf("セクション数の書き込みに失敗しました: %w", err)
	}
	sections := []any{baseFares, physicalDistGisei, physicalDistGisei}
	lengths := []uint64{
		uint64(len(baseFares) * 4), uint64(len(physicalDistGisei) * 2), uint64(len(physicalDistGisei) * 2),
	}
	for _, length := range lengths {
		if err := binary.Write(outServerFile, binary.LittleEndian, length); err != nil {
			return fmt.Errorf("セクション長の書き込みに失敗しました: %w", err)
		}
	}
	for i, section := range sections {
		if err := binary.Write(outServerFile, binary.LittleEndian, section); err != nil {
			return fmt.Errorf("セクション%dの書き込みに失敗しました: %w", i, err)
		}
	}

	return nil
}
