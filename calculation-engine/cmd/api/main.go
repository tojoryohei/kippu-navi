package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"calculation-engine/internal/graphdata"
	passdomain "calculation-engine/internal/pass/domain"
	passgraph "calculation-engine/internal/pass/graph"
	passdata "calculation-engine/internal/pass/graph/data"
	passhandler "calculation-engine/internal/pass/handler"
	passfareio "calculation-engine/internal/pass/infra/fareio"
	passgraphio "calculation-engine/internal/pass/infra/graphio"
	passopt "calculation-engine/internal/pass/optimizer"
	passusecase "calculation-engine/internal/pass/usecase"
	ticketdata "calculation-engine/internal/ticket/data"
	ticketdomain "calculation-engine/internal/ticket/domain"
	ticketfare "calculation-engine/internal/ticket/fare"
	tickethandler "calculation-engine/internal/ticket/handler"
	ticketfareio "calculation-engine/internal/ticket/infra/fareio"
	ticketgraphio "calculation-engine/internal/ticket/infra/graphio"
	ticketusecase "calculation-engine/internal/ticket/usecase"
	"io"
)

const (
	// shutdownTimeout はgraceful shutdownの最大待機時間です
	shutdownTimeout = 10 * time.Second
	// defaultPrecomputedDataDir はサーバー専用の事前計算データの既定配置です。
	defaultPrecomputedDataDir = "./data/precomputed"
)

var localDevelopmentOrigins = map[string]struct{}{
	"http://localhost:3000": {},
	"http://127.0.0.1:3000": {},
}

func allowLocalDevelopmentCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if _, allowed := localDevelopmentOrigins[origin]; allowed {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type, X-Request-ID")
			w.Header().Set("Access-Control-Expose-Headers", "X-Request-ID")
			w.Header().Add("Vary", "Origin")
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (w *statusRecorder) WriteHeader(status int) {
	if w.wroteHeader {
		return
	}
	w.status = status
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(status)
}

func (w *statusRecorder) Write(body []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(body)
}

func observeRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		startedAt := time.Now()
		requestID := r.Header.Get("X-Request-ID")
		if requestID != "" {
			w.Header().Set("X-Request-ID", requestID)
		}
		recorder := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		defer func() {
			if recovered := recover(); recovered != nil {
				if !recorder.wroteHeader {
					http.Error(recorder, "Internal Server Error", http.StatusInternalServerError)
				}
				slog.Error("api panic", "request_id", requestID, "path", r.URL.Path)
			}
			slog.Info("api request", "request_id", requestID, "path", r.URL.Path, "method", r.Method, "status", recorder.status, "elapsed_ms", time.Since(startedAt).Milliseconds())
		}()
		next.ServeHTTP(recorder, r)
	})
}

func main() {
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, nil)))
	if err := run(); err != nil {
		slog.Error("fatal startup error", "error", err)
		os.Exit(1)
	}
}

func run() error {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // デフォルト値
	}
	listenAddr := ":" + port
	precomputedDataDir := os.Getenv("PRECOMPUTED_DATA_DIR")
	if precomputedDataDir == "" {
		precomputedDataDir = defaultPrecomputedDataDir
	}

	// グラフの初期化
	loader := &passgraphio.JSONLoader{}
	g, loadErr := loader.Load(passdata.GetEdgesReader())
	if loadErr != nil {
		return fmt.Errorf("JSONの読み込みに失敗しました: %w", loadErr)
	}

	// 乗車券グラフの初期化
	ticketLoader := &ticketgraphio.JSONLoader{}
	ticketSearchGraph, ticketFullGraph, err := ticketLoader.LoadSeparatedGraphs(
		[]io.Reader{graphdata.GetEdgesReader()},
		graphdata.GetFareGraphEdgeReaders(),
	)
	if err != nil {
		return fmt.Errorf("乗車券グラフのロードに失敗しました: %w", err)
	}

	// 定期券の運賃計算レジストリの初期化
	passCalcs, err := passfareio.InitRegistry(g)
	if err != nil {
		return fmt.Errorf("運賃計算機の初期化に失敗しました: %w", err)
	}

	// 定期券の特定区間加算運賃の設定
	passAddonFareReg := passdomain.NewAddonRegistry()
	passAddonFareReg.Register("南千歳", "新千歳空港", passdomain.PassPrice{OneMonth: 660, ThreeMonth: 1880, SixMonth: 3180})
	passAddonFareReg.Register("日根野", "りんくうタウン", passdomain.PassPrice{OneMonth: 4690, ThreeMonth: 13320, SixMonth: 22440})
	passAddonFareReg.Register("日根野", "関西空港", passdomain.PassPrice{OneMonth: 6640, ThreeMonth: 18900, SixMonth: 31820})
	passAddonFareReg.Register("りんくうタウン", "関西空港", passdomain.PassPrice{OneMonth: 5010, ThreeMonth: 14250, SixMonth: 24000})
	passAddonFareReg.Register("児島", "宇多津", passdomain.PassPrice{OneMonth: 1610, ThreeMonth: 4600, SixMonth: 8170})
	passAddonFareReg.Register("田吉", "宮崎空港", passdomain.PassPrice{OneMonth: 3840, ThreeMonth: 10960, SixMonth: 18680})

	// IDを解決
	if err := passAddonFareReg.ResolveIDs(func(name string) (int, bool) {
		return g.GetID(name)
	}); err != nil {
		return fmt.Errorf("加算運賃のID解決に失敗しました: %w", err)
	}

	// 特急料金の設定
	passAddonChargeReg := passdomain.NewAddonRegistry()
	passAddonChargeReg.Register("博多", "博多南", passdomain.PassPrice{OneMonth: 4680, ThreeMonth: 13340, SixMonth: 25270})

	// IDを解決
	if err := passAddonChargeReg.ResolveIDs(func(name string) (int, bool) {
		return g.GetID(name)
	}); err != nil {
		return fmt.Errorf("特急料金のID解決に失敗しました: %w", err)
	}

	// 旅客営業規則 第69条 特例区間の設定
	passBypassReg := passdomain.NewDefaultBypassRegistry()
	// (5) 東京以遠（品川、有楽町又は神田方面）の各駅と、蘇我以遠（鎌取又は浜野方面）の各駅との相互間
	// 旅客営業規則上は補正する必要がありますが、営業キロが等しく実際の定期券でも補正が行われていないため、特例区間として定義しません。

	// IDを解決
	passBypassRules, err := passBypassReg.ResolveIDs(func(name string) (int, bool) {
		return g.GetID(name)
	})
	if err != nil {
		return fmt.Errorf("特例ルールのID解決に失敗しました: %w", err)
	}

	passPrivateFareReg, err := passfareio.NewPrivateFareRegistry()
	if err != nil {
		return fmt.Errorf("定期券用私鉄運賃データの読み込みに失敗しました: %w", err)
	}

	passAmountCalc := passusecase.NewCalculateAmount(
		g,
		passCalcs.Registry,
		passAddonFareReg,
		passAddonChargeReg,
		passCalcs.TrainSpecific,
		passCalcs.SpecificRoute,
		passCalcs.AdjustedRoute,
		passPrivateFareReg,
	)

	passOptimizer := passopt.NewDPOptimizer(passAmountCalc)
	passSplitUseCase := passusecase.NewFindOptimalSplit(passOptimizer, passAmountCalc)

	// 事前計算された運賃および経路データのロード
	baseFares, icFares, baseDistGisei, icDistGisei, numStations, err := passdata.LoadPrecomputedFares(filepath.Join(precomputedDataDir, "pass.bin"))
	if err != nil {
		return fmt.Errorf("事前計算された運賃データのロードに失敗しました: %w", err)
	}
	if int32(g.NumStations()) != numStations {
		return fmt.Errorf("データ不整合: edges.jsonの駅数(%d)が事前計算データの駅数(%d)と一致しません。事前計算ファイルを再生成してください", g.NumStations(), numStations)
	}

	// グラフに事前計算されたマトリクスを格納
	g.DistGisei = baseDistGisei

	// 磁気定期券用: 区間数無制限 (0)
	passSearchUseCase := passusecase.NewSearchOptimalSplit(g, passSplitUseCase, passBypassRules, 0, baseFares, numStations)

	// IC分割乗車券用
	icGraph, err := passgraph.NewIcPassGraph(g)
	if err != nil {
		return fmt.Errorf("ICグラフの生成に失敗しました: %w", err)
	}
	icGraph.DistGisei = icDistGisei

	icPassSearchUseCase := passusecase.NewSearchOptimalSplit(icGraph, passSplitUseCase, passBypassRules, 2, icFares, numStations)

	// 乗車券用コンポーネント初期化
	zoneRoutesBytes, err := io.ReadAll(graphdata.GetZoneRoutesReader())
	if err != nil {
		return fmt.Errorf("乗車券の特例ゾーンルート読み込みに失敗しました: %w", err)
	}
	ticketZoneRoutes, err := ticketdomain.LoadZoneRoutesFromBytes(zoneRoutesBytes)
	if err != nil {
		return fmt.Errorf("乗車券の特例ゾーンルートロードに失敗しました: %w", err)
	}

	arBytes, err := io.ReadAll(graphdata.GetArticle70RoutesReader())
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
	for _, zoneName := range ticketZoneRoutes.ZoneNames() {
		ticketFullGraph.GetOrAddID(zoneName)
	}
	// 特例駅の追加後に連結成分を確定する。探索用グラフと運賃計算用グラフは
	// 駅名マッピングを共有する一方、連結成分IDはそれぞれ保持するため両方を検証する。
	if err := ticketSearchGraph.Validate(); err != nil {
		return fmt.Errorf("乗車券探索グラフの検証に失敗しました: %w", err)
	}
	if err := ticketFullGraph.Validate(); err != nil {
		return fmt.Errorf("乗車券運賃計算グラフの検証に失敗しました: %w", err)
	}

	ticketFareReg := ticketfare.NewRegistry()
	ticketFareioReg, err := ticketfareio.NewRegistry()
	if err != nil {
		return fmt.Errorf("乗車券の運賃データのロードに失敗しました: %w", err)
	}
	ticketRouteExtensions, err := ticketusecase.NewRouteExtensionMatcherIDs(ticketfareio.GetGeneratedRouteExtensions(), ticketFullGraph)
	if err != nil {
		return fmt.Errorf("乗車券の経路延長対応表初期化に失敗しました: %w", err)
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

	// 経路補正候補を、運賃特例適用後の通常モードの運賃で比較する。
	// Correctorには物理経路だけを返すため、評価器が返す変換後経路は破棄する。
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

	ticketHandler := tickethandler.NewTicketWithRouteExtensionsAndZones(ticketFullGraph, ticketCorrector, ticketSegmentEvaluator, ticketRouteExtensions, ticketZoneReg)

	ticketSearchUseCase := ticketusecase.NewSearchOptimalSplit(ticketSearchGraph, ticketSegmentEvaluator, ticketZoneReg)
	ticketSearchUseCase.SetPathCorrector(ticketCorrector)

	ticketFares, ticketDistGisei, numTicketStations, err := ticketdata.LoadPrecomputedTicketFares(filepath.Join(precomputedDataDir, "ticket.bin"))
	if err != nil {
		return fmt.Errorf("乗車券探索用データの読み込みに失敗しました: %w", err)
	} else if int32(ticketFullGraph.NumStations()) != numTicketStations {
		return fmt.Errorf("乗車券探索用データの駅数が一致しません: graph=%d data=%d", ticketFullGraph.NumStations(), numTicketStations)
	} else {
		ticketSearchUseCase.SetPrecomputedFares(ticketFares)
		ticketSearchGraph.DistGisei = ticketDistGisei
	}

	ticketSplitHandler := tickethandler.NewSplit(ticketSearchGraph, ticketSearchUseCase)

	// ルーティング
	mux := http.NewServeMux()

	// 定期券ルート
	passSplitHandler := passhandler.NewSplit(g, passSearchUseCase)
	mux.HandleFunc("/api/split-pass", passSplitHandler.HandleCalculate)

	icPassSplitHandler := passhandler.NewSplit(icGraph, icPassSearchUseCase)
	mux.HandleFunc("/api/split-icpass", icPassSplitHandler.HandleCalculate)

	// 乗車券ルート
	mux.HandleFunc("/api/fare", ticketHandler.HandleCalculateFare)
	mux.HandleFunc("/api/fare/ticket", ticketHandler.HandleCalculateFare)
	mux.HandleFunc("/api/split-ticket", ticketSplitHandler.HandleCalculate)

	server := &http.Server{
		Addr:         listenAddr,
		Handler:      observeRequests(allowLocalDevelopmentCORS(mux)),
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	// シグナルを受け取ったら graceful shutdown するためのコンテキスト
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// サーバーをgoroutineで起動
	errChan := make(chan error, 1)
	go func() {
		slog.Info("calculation-engine started", "address", server.Addr)
		if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			errChan <- err
		}
	}()

	// SIGINT / SIGTERM またはサーバーエラーを待機
	select {
	case err := <-errChan:
		return fmt.Errorf("サーバーが異常終了しました: %w", err)
	case <-ctx.Done():
		slog.Info("shutdown signal received")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown に失敗しました: %w", err)
	}

	slog.Info("calculation-engine stopped")
	return nil
}
