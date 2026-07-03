package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"split-pass-api/internal/domain"
	"split-pass-api/internal/graph"
	"split-pass-api/internal/graph/data"
	"split-pass-api/internal/handler"
	"split-pass-api/internal/infra/fareio"
	"split-pass-api/internal/infra/graphio"
	"split-pass-api/internal/optimizer"
	"split-pass-api/internal/usecase"
)

const (
	// shutdownTimeout はgraceful shutdownの最大待機時間です
	shutdownTimeout = 10 * time.Second
)

func main() {
	if err := run(); err != nil {
		log.Printf("致命的なエラー: %v", err)
		os.Exit(1)
	}
}

func run() error {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080" // デフォルト値
	}
	listenAddr := ":" + port

	// グラフの初期化
	loader := &graphio.JSONLoader{}
	g, loadErr := loader.Load(data.GetEdgesReader())
	if loadErr != nil {
		return fmt.Errorf("JSONの読み込みに失敗しました: %w", loadErr)
	}

	// 運賃計算レジストリの初期化
	calcs, err := fareio.InitRegistry(g)
	if err != nil {
		return fmt.Errorf("運賃計算機の初期化に失敗しました: %w", err)
	}

	// 特定区間加算運賃の設定
	addonFareReg := domain.NewAddonRegistry()
	addonFareReg.Register("南千歳", "新千歳空港", domain.PassPrice{OneMonth: 660, ThreeMonth: 1880, SixMonth: 3180})
	addonFareReg.Register("日根野", "りんくうタウン", domain.PassPrice{OneMonth: 4690, ThreeMonth: 13320, SixMonth: 22440})
	addonFareReg.Register("日根野", "関西空港", domain.PassPrice{OneMonth: 6640, ThreeMonth: 18900, SixMonth: 31820})
	addonFareReg.Register("りんくうタウン", "関西空港", domain.PassPrice{OneMonth: 5010, ThreeMonth: 14250, SixMonth: 24000})
	addonFareReg.Register("児島", "宇多津", domain.PassPrice{OneMonth: 1610, ThreeMonth: 4600, SixMonth: 8170})
	addonFareReg.Register("田吉", "宮崎空港", domain.PassPrice{OneMonth: 3840, ThreeMonth: 10960, SixMonth: 18680})

	// IDを解決
	if err := addonFareReg.ResolveIDs(func(name string) (int, bool) {
		return g.GetID(name)
	}); err != nil {
		return fmt.Errorf("加算運賃のID解決に失敗しました: %w", err)
	}

	// 特急料金の設定
	addonChargeReg := domain.NewAddonRegistry()
	addonChargeReg.Register("博多", "博多南", domain.PassPrice{OneMonth: 4680, ThreeMonth: 13340, SixMonth: 25270})

	// IDを解決
	if err := addonChargeReg.ResolveIDs(func(name string) (int, bool) {
		return g.GetID(name)
	}); err != nil {
		return fmt.Errorf("特急料金のID解決に失敗しました: %w", err)
	}

	// 旅客営業規則 第69条 特例区間の設定
	bypassReg := domain.NewBypassRegistry()
	// (1) 大沼以遠の各駅と、森以遠の各駅との相互間
	bypassReg.Register(
		[]string{"大沼", "大沼公園", "赤井川", "駒ケ岳", "森"},
		[]string{"大沼", "鹿部", "渡島沼尻", "渡島砂原", "掛澗", "尾白内", "東森", "森"},
	)
	// (2) 日暮里以遠の各駅と、赤羽以遠の各駅との相互間
	bypassReg.Register(
		[]string{"日暮里", "西日暮里", "田端", "上中里", "王子", "東十条", "赤羽"},
		[]string{"日暮里", "尾久", "赤羽"},
	)
	// (3) 赤羽以遠の各駅と、大宮以遠の各駅との相互間
	bypassReg.Register(
		[]string{"赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"},
		[]string{"赤羽", "北赤羽", "浮間舟渡", "戸田公園", "（北）戸田", "北戸田", "武蔵浦和", "中浦和", "南与野", "与野本町", "北与野", "大宮"},
	)
	// (4) 品川以遠の各駅と、鶴見以遠の各駅との相互間
	bypassReg.Register(
		[]string{"品川", "大井町", "大森", "蒲田", "川崎", "鶴見"},
		[]string{"品川", "西大井", "武蔵小杉", "新川崎", "鶴見"},
	)
	// (5) 東京以遠（品川、有楽町又は神田方面）の各駅と、蘇我以遠（鎌取又は浜野方面）の各駅との相互間
	// 旅客営業規則上は補正する必要がありますが、営業キロが等しく実際の定期券でも補正が行われていないため、特例区間として定義しません。

	// IDを解決
	bypassRules, err := bypassReg.ResolveIDs(func(name string) (int, bool) {
		return g.GetID(name)
	})
	if err != nil {
		return fmt.Errorf("特例ルールのID解決に失敗しました: %w", err)
	}

	amountCalc := usecase.NewCalculateAmount(
		g,
		calcs.Registry,
		addonFareReg,
		addonChargeReg,
		calcs.TrainSpecific,
		calcs.SpecificRoute,
		calcs.AdjustedRoute,
	)

	opt := optimizer.NewDPOptimizer(amountCalc)
	splitUseCase := usecase.NewFindOptimalSplit(opt, amountCalc)

	// 事前計算された運賃および経路データのロード
	baseFares, icFares, baseDistGisei, icDistGisei, numStations, err := data.LoadPrecomputedFares("./internal/graph/data/precomputed_server.bin")
	if err != nil {
		return fmt.Errorf("事前計算された運賃データのロードに失敗しました: %w", err)
	}
	if int32(g.NumStations()) != numStations {
		return fmt.Errorf("データ不整合: edges.jsonの駅数(%d)が事前計算データの駅数(%d)と一致しません。事前計算ファイルを再生成してください", g.NumStations(), numStations)
	}

	// グラフに事前計算されたマトリクスを格納
	g.DistGisei = baseDistGisei

	// 磁気定期券用: 区間数無制限 (0)
	searchUseCase := usecase.NewSearchOptimalSplit(g, splitUseCase, bypassRules, 0, baseFares, numStations)

	// IC分割乗車券用
	icGraph, err := graph.NewIcPassGraph(g)
	if err != nil {
		return fmt.Errorf("ICグラフの生成に失敗しました: %w", err)
	}
	icGraph.DistGisei = icDistGisei

	icSearchUseCase := usecase.NewSearchOptimalSplit(icGraph, splitUseCase, bypassRules, 2, icFares, numStations)

	// ルーティング
	mux := http.NewServeMux()
	splitHandler := handler.NewSplit(g, searchUseCase)
	mux.HandleFunc("/api/split-pass", splitHandler.HandleCalculate)

	icSplitHandler := handler.NewSplit(icGraph, icSearchUseCase)
	mux.HandleFunc("/api/split-icpass", icSplitHandler.HandleCalculate)

	server := &http.Server{
		Addr:         listenAddr,
		Handler:      mux,
		ReadTimeout:  10 * time.Second,
		WriteTimeout: 10 * time.Second,
	}

	// シグナルを受け取ったら graceful shutdown するためのコンテキスト
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// サーバーをgoroutineで起動
	errChan := make(chan error, 1)
	go func() {
		log.Printf("split-pass-api を起動しました: %s", server.Addr)
		if err := server.ListenAndServe(); !errors.Is(err, http.ErrServerClosed) {
			errChan <- err
		}
	}()

	// SIGINT / SIGTERM またはサーバーエラーを待機
	select {
	case err := <-errChan:
		return fmt.Errorf("サーバーが異常終了しました: %w", err)
	case <-ctx.Done():
		log.Println("シャットダウンシグナルを受信しました。接続の終了を待っています...")
	}

	shutdownCtx, cancel := context.WithTimeout(context.Background(), shutdownTimeout)
	defer cancel()

	if err := server.Shutdown(shutdownCtx); err != nil {
		return fmt.Errorf("graceful shutdown に失敗しました: %w", err)
	}

	log.Println("サーバーを正常に停止しました")
	return nil
}
