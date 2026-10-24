# テスト削除・統合候補の精査（2026-10-23）

## 対象と結論

追跡対象のテスト104ファイル（Go 77、Node 10、Playwright 15、Python 1、Renovateスクリプト1）を、期待値の独立性・重複・製品の観測結果・費用の観点で確認した。補助コード、テスト設定、呼び出す実装も参照した。末尾に全ファイルの処置を記す。候補をコードへ反映した。以下の候補欄は当初の判断を記録し、最終的な採否と変更内容は「反映結果」を正とする。

優先順位はD（直接削除・少数ケースへ集約）、C（保証を移して統合）、R（弱い検証方式の置換）、E（ブラウザ・実行費用の削減）。IDは作業単位であり、削除できるテスト件数ではない。失う検知は右欄に明記し、件数・カバレッジ維持を理由に残していない。

先に取り組む対象は、D07の空データ検証、R01/R02の事前計算コピーと暗黙mock、E01/E06/E07の待機・長距離計算・UI用実WASM、D02/C09/C12の同じ回帰入力の重複である。

## 反映結果

58項目を処置した。C16・E08は再評価で維持、C14・E09・E13は対象の一部を維持した。維持理由は件数やカバレッジではなく、固有の不具合検知と実行・保守費用で判断した。

| ID | 最終的な変更・判断 |
| --- | --- |
| D01 | 固定15秒の定数比較を削除。timeout・親abort・再試行の動作検証を維持。 |
| D02 | 重複する保存失敗3ケースを削除。診断通知側で旧キャッシュ維持と新キャッシュ破棄も検証。 |
| D03 | テスト用HTTPサーバーの自己検証ループとhttpRequest importを削除。 |
| D04 | ログだけの会津デバッグテストをファイルごと削除。 |
| D05 | ほしみの重複デバッグテストをファイルごと削除。 |
| D06 | デフォルト規則の件数だけを固定するテストを削除。 |
| D07 | 空データに対する5テストを、ソース・生成物が空である1テストへ集約。グラフ読込と未実行ループを削除。 |
| D08 | 同じTotalAmount同士の比較を削除。 |
| D09 | 会社跨ぎのFare > 0だけのケースを削除。 |
| D10 | 東京→大阪の非空スモークを削除。実グラフで金額・経路を検証する統合テストを維持。 |
| D11 | registryの非nil確認を削除。 |
| D12 | 確保サイズ・チャンク数・内部countの固定を削除。Append/At/Resetの結果と既存benchmarkを維持。 |
| D13 | スライス・mapper・searchのポインタ同一性を削除。 |
| D14 | テストが無条件scheduleを注入して確認する部分を削除。 |
| C01 | 誤称のHashCollisionテストを削除し、同じ駅の並び順違いを通常のテーブルへ統合。実際の衝突検証は維持。 |
| C02 | GobのEmptyReader重複を削除し、破損入力の伝播を維持。 |
| C03 | 実グラフを読む各社Get確認を削除。未知会社拒否だけを小さいregistryケースへ。 |
| C04 | 単一区間を削除し、複数区間の期待値に逆方向を統合。 |
| C05 | 手作り逆引きmapを削除。LoadSpecialZonesの実データから駅・ゾーンを検索する検証へ。 |
| C06 | 環境×statusを代表3組へ。WriteとWriteHeaderの違いは維持。 |
| C07 | 廃止ルートのGET/POST重複を各パス1件へ。 |
| C08 | 期間とオプションを4組へ縮小。欠損・破損・不整合と両券種を維持し、並行呼出しは欠損の代表条件へ集約。 |
| C09 | TestPipelineCorrectorの重複3経路を削除。実グラフの統合ケースと補正前情報の伝播テストを維持。 |
| C10 | 基本短縮と単駅のモックケースを削除。実グラフの基本短縮と、固有の混在・区間判定を維持。 |
| C11 | 内部のmode対応表テストを削除。隣接区間の公開計算でunknownをnormalの結果と比較するケースへ。 |
| C12 | 新幹線重複印字の単体2ケースを削除。統合側の具体経路を維持。 |
| C13 | IRいしかわの重複ケースを削除し、私鉄印字テストを公開GetFareViaで実行。仮想端点を既存の印字テーブルへ移し、内部bounds固定を削除。 |
| C14 | 第69/157条の規則配列参照を独立した固定入力・出力へ置換。省略条件の類似反復、控除件数13・添字対応を削除。物理接続の整合性は維持。pass/viaはもともと独立した期待値であり、当初候補の対象指定を訂正して維持。 |
| C15 | ログ捕捉を、結果経路が使われる1件と印字生成時の無出力確認へ集約。 |
| C16 | 再評価して維持。営業キロと擬制キロが異なる複数会社の集計で、JR西日本以外を減算する誤りと過剰控除を小さいfixtureで直接検出する。公開運賃に置き換えるには大きい料金fixtureが必要になり、削減より保守負担が増える。 |
| C17 | 36組を料金合成・特例mode・1/3/6月を分担する6組へ縮小。独立した総当たりoracleは維持。 |
| C18 | 重複拒否のResolvePathをmodeループ外へ。各公開計算入口の拒否は維持。 |
| C19 | 補正器・入れ子補正の同じ検証をmodeループ外へ。 |
| C20 | 元JSONを期待値へ使うWholeCorridorsを削除。具体経路と総当たりoracleを維持。 |
| R01 | 事前計算のアルゴリズムコピーを削除。本番ComputeCheapestNoSplitはfixtureの表構築にだけ使い、正解経路は個別ケースで固定。0円fixtureの3/6月反復を削除。全ケースを固定行列に作り直す案は、既存の独立した期待経路を利用する方針へ変更。 |
| R02 | 暗黙mockとmock用bin生成を削除。通常の統合テストは実グラフ・実運賃でon-demand検索し、短い具体経路と特例を確認。事前計算表との互換性はAPI fallbackへ集約。既存の事前計算benchmarkは正しいdataパスを使い、不在時は失敗する。 |
| R03 | YAMLをparseしてbuildの有効権限・Environment・secret参照を検証。workflow側の権限/env継承も評価。既存lockfile内のyaml 2.9.1を直接devDependencyとして明示。境界を外す3種類の一時的mutationで失敗を確認。 |
| R04 | transpileとソース文字列置換を削除。NodeのregisterHooksでブラウザ専用のanalytics依存とaliasを解決し、実TypeScriptをimport。 |
| R05 | 進捗通知の時計を内部関数に注入し、sleepを削除。公開関数はtime.Nowを使用。全区間の厳密な評価件数を削除し、重複評価・結果・途中通知・失敗時未完了を維持。 |
| E01 | 広告不在を代表1ケースへ。5500msの実待機をPlaywright clockで進める。 |
| E02 | status×券種を5組へ縮小。全endpoint接続と408/429/503の違い、400拒否を維持。フォント分割数100固定を削除し、保存存在とオフライン文字読込を維持。 |
| E03 | 会社線形状2件を1月/6月へ配分。期間切替は既存route-split側が1/3/6月を検証。 |
| E04 | 全7ルートのSSRはHTTPで検証。代表3フォームで初期inert、URL復元、操作解除、高さ維持を同時に確認。 |
| E05 | 専用の実WASM進捗2ケースを削除し、既存route-splitの実計算でcalculating/organizingの受信を確認。細かいUI状態は制御Workerで維持。 |
| E06 | Go長距離はbenchmark、WASM長距離は@performanceタグへ。通常Playwrightではタグを除外。どちらも明示実行し成功を確認。 |
| E07 | UI件数の検証に固定Worker応答を使い、実WASM初期化と計算を削除。3→1→0、展開リセット、狭幅/PCを確認。 |
| E08 | 再評価して維持。現行のケースは置換後の候補駅、重複で戻る駅、印字文字列という異なるUI接続を確認する。Goの計算一致では代替できず、各ケース約0.4〜0.7秒の実測費用に対して価値がある。 |
| E09 | API timeoutだけ制御時計へ。403/404の削除案は撤回し両方維持。frontend.test.mjsはサーバー側で、ブラウザWorkerの資材再取得とは別実装。 |
| E10 | 記事のmobileメニュー重複を削除し、prefetch/非hydration/スクロール解除をheaderへ統合。クエリ往復はPC代表へ、mobile操作は別ケースで維持。 |
| E11 | 38px・色・padding・ライブラリ内部DOMの固定を削除。入力幅、Emotion style消失後、非露出live region、はみ出しを維持。 |
| E12 | 幅は320/1280へ、months正規化は新旧キーと優先順位を分担した4組へ。 |
| E13 | 全キー操作は代表フォームへ集約。他フォームは末尾選択まで。全スクロール走査は維持：異なる候補データと同名駅の欠落を検知し、今回の実測は約1.1秒/3.2秒。中間点だけの検証へ置換する案は採らない。 |
| E14 | 全記事はHTTP+DOMParserでmetadataを検証し、リンクは重複排除。JSなし実表示は代表記事。計算例の算術はpage fixtureを使わないケースに分離。元からrequest-onlyの全ページmetadataは維持。 |
| E15 | stationData丸ごとコピー比較と派生集合の重複を削除。重複駅名・具体的な曖昧駅・API schema/配信契約を維持。 |
| E16 | 旧説明文の不在とリンク6件固定を削除。関連リンク・表示と構造化データの契約を維持。 |
| E17 | 通常閲覧の更新履歴状態とSW未登録をmanifestの遷移ケースへ統合。 |
| E18 | 比較しない成功時画像を削除。Playwrightは失敗時画像のみ保存する設定へ。 |
| E19 | dev起動はticket1月/pass3月/IC6月の3件へ。文書の期間キー、実APIの全期間対応、同じGo runtime配信の検証を維持。 |

### 検証結果（反映後）

- npm run lint：0 errors / 0 warnings。
- npm run typecheck：0 errors / 0 warnings / 0 hints。npm run knip：成功。
- Node worker / automation / verification：77 tests成功。
- Go全パッケージ：成功。API・進捗処理のrace検査も成功。
- ブラウザ：通常90ケースの一括実行が成功。その後維持に戻した403を含む403/404の2ケースも成功（最終構成の通常ケースは91）。
- 開発サーバー：実API/WASMの7ケース成功。
- 長距離WASM：1ケース成功、計算時間約17.66秒。Go benchmark：1回で約3.95秒、約6.80 GB/opの累積確保。メモリ量は同時使用量ではない。
- ワークフローの有効権限・Environment・継承envのsecretを個別に緩めた一時的なmutationで、改修した境界テストがそれぞれ失敗することを確認。ワークフロー自体の変更は残していない。
- 比較条件をそろえた変更前後のCI実測は行っていない。上記時間からCI全体の短縮率は算出しない。

長距離計測は次で明示実行できる。

    RUN_PERFORMANCE_TESTS=1 npx playwright test --grep @performance
    cd calculation-engine
    go test ./tests/integration/ticket -run '^$' -bench '^BenchmarkSplitConventionalLongRoute$' -benchtime=1x

## 候補一覧

対象部分が処置単位であり、ファイル全体を削除する指示ではない。以下は当初候補であり、実際に維持・修正した判断は反映結果に記載した。

### 直接削除・部分削除

| ID / 対象 | 処置・根拠 | 削除で失う検知・残す最小保証 |
| --- | --- | --- |
| **D01** [tests/worker/api.test.mjs](../tests/worker/api.test.mjs)<br>API_REQUEST_TIMEOUT_MSの15000固定値比較 | **削除**。定数を変更すると落ちるだけ。タイムアウト時のフォールバックは別ケースが検証。 | 15秒という数値そのものの変更は検知しなくなる。動作保証とは分離する。 |
| **D02** [tests/worker/pwa.test.mjs](../tests/worker/pwa.test.mjs)<br>99行目からの保存失敗3ケース | **削除**。149行目以降の失敗段階・資材通知テストも同じ失敗、旧キャッシュ維持、新キャッシュ破棄を確認。 | 後段3ケースを残せば同じ保存失敗の検知を失わない。 |
| **D03** [tests/browser/pwa-update.spec.ts](../tests/browser/pwa-update.spec.ts)<br>テスト用HTTPサーバーへ不正パスを送るループ | **部分削除**。テスト自身が定義した400応答の自己検証。製品の更新処理を通らない。 | テストサーバーの拒否実装の変更は検知しなくなる。サーバー側の拒否コード自体は残す。 |
| **D04** `calculation-engine/cmd/scan-article114/debug_aizu_test.go`（削除済み）<br>TestDebugAizu | **削除**。結果をログ出力するだけで期待運賃・経路を比較しない。scanner_test.goに具体的な回帰経路がある。 | 当該デバッグ入力がエラーになることの単独検知のみ失う。計算結果の正しさは現状でも保証していない。 |
| **D05** `calculation-engine/cmd/scan-article114/debug_hoshimi_test.go`（削除済み）<br>TestDebugCheapestHoshimi | **削除**。scanner_test.goのTestArticle114RegressionRoutesでもほしみ→東旭川の4840円を検証。 | 同じ入力と期待金額の検証が残る。 |
| **D06** `calculation-engine/internal/pass/domain/bypass_test.go`（削除済み）<br>TestDefaultBypassRulesAreShared | **削除**。ルール件数4を固定しているだけで、共有・内容・適用結果を確認していない。 | ルール増減自体は検知しなくなる。個別の特例経路の結果テストを残す。 |
| **D07** [calculation-engine/internal/ticket/infra/fareio/json_loader_test.go](../calculation-engine/internal/ticket/infra/fareio/json_loader_test.go)<br>[calculation-engine/internal/ticket/usecase/route_extension_test.go](../calculation-engine/internal/ticket/usecase/route_extension_test.go)<br>TestRouteExtensionJSONContainsPathsOnly / TestGeneratedRouteExtensionsMatchSourceJSON / TestRouteExtensionRegistryIsEmptyAfterRemovingArticle114Routes / TestEmbeddedRouteExtensionsUsePhysicalJRPaths / TestGeneratedRouteExtensionsUsePhysicalPaths | **5本を最大1本へ**。データが空で物理経路チェックのループは実行されない。空データの一致に実グラフ読込は不要。 | 手動拡張ルールを復活させない方針を検証したい場合だけソースと生成データの空配列チェックを1本残す。将来の非空データを検証済みとは扱わない。 |
| **D08** [calculation-engine/internal/pass/usecase/calculate_amount_test.go](../calculation-engine/internal/pass/usecase/calculate_amount_test.go)<br>構造体全体の一致後のTotalAmount同士の比較 | **部分削除**。同一フィールドに同じメソッドを適用して比較しており、TotalAmount自体の誤りを検出できない。 | 独立した合計値の検証ではなく、現実的な検出能力を失わない。 |
| **D09** [calculation-engine/internal/ticket/usecase/calculate_amount_test.go](../calculation-engine/internal/ticket/usecase/calculate_amount_test.go)<br>通常運賃（会社跨ぎ）のFare > 0だけのケース | **ケース削除**。会社境界の誤った足し算でも通過。joint_test.goと実額を確認する統合テストの方が強い。 | そのダミー入力がゼロになる検知のみ失う。独自の合成分岐を維持するなら期待実額へ置換してから削除。 |
| **D10** `calculation-engine/internal/ticket/graph/graph_test.go`（削除済み）<br>TestRailwayGraph_LoadAndFindPath | **削除**。東京→大阪の非空確認だけで端点不在時にはskip。具体経路の統合テストと重複。 | この1経路の存在だけのスモーク検知を失う。実データの計算テストは残る。 |
| **D11** [calculation-engine/internal/ticket/infra/fareio/json_loader_test.go](../calculation-engine/internal/ticket/infra/fareio/json_loader_test.go)<br>TestNewRegistry | **削除**。初期化後の非nil確認。実際にregistryを使う運賃計算が初期化不良も検知する。 | 未使用フィールドだけがnilになる変更は検知しなくなる。必要な計算結果を基準にする。 |
| **D12** [calculation-engine/internal/pass/usecase/search_optimal_split_scratch_test.go](../calculation-engine/internal/pass/usecase/search_optimal_split_scratch_test.go)<br>TestDPScratchAllocationPhases、StaticListNodeStoreのchunks/count直接比較 | **削除・部分削除**。スライス長・チャンク数の固定は確保方式の改善を妨げる。Append/At/Resetの観測結果は維持。 | 確保量増大は機能テストでは検知しなくなる。必要なら既存benchmarkでB/op・allocs/opを評価。 |
| **D13** [calculation-engine/internal/ticket/infra/graphio/json_test.go](../calculation-engine/internal/ticket/infra/graphio/json_test.go)<br>[calculation-engine/internal/pass/graph/ic_pass_graph_test.go](../calculation-engine/internal/pass/graph/ic_pass_graph_test.go)<br>[calculation-engine/cmd/api/pass_fallback_test.go](../calculation-engine/cmd/api/pass_fallback_test.go)<br>共有スライス・mapper・searchのポインタ同一性 | **部分削除**。結果が等しくても内部の共有方法を変更するだけで失敗する。 | 余分な複製・再生成の性能低下は見逃す。ID整合性・結果・同時アクセスを残し、性能はbenchmarkに分離。 |
| **D14** [scripts/test-renovate-schedule.mjs](../scripts/test-renovate-schedule.mjs)<br>vulnerabilityAlertsのscheduleをat any timeで上書きした検証 | **部分削除**。テストが無条件スケジュールを注入してライブラリを確認している。 | 実際の脆弱性更新設定の誤りは現状でも検出できない。通常更新・lockfile更新の実設定評価は残す。 |

### 既存の検証への統合

| ID / 対象 | 処置・根拠 | 削除で失う検知・残す最小保証 |
| --- | --- | --- |
| **C01** [calculation-engine/internal/pass/fare/path_matcher_test.go](../calculation-engine/internal/pass/fare/path_matcher_test.go)<br>[calculation-engine/internal/ticket/fare/path_matcher_test.go](../calculation-engine/internal/ticket/fare/path_matcher_test.go)<br>TestPathMatcher_HashCollision | **各通常テーブルへ統合**。衝突を強制せず、通常の順序違い・逆順・部分一致を再検証。順序違いの1行を移す。 | 実際に衝突させるpass/path_matcher_internal_test.goのFalsePositiveは別の不具合を検知するので残す。 |
| **C02** [calculation-engine/internal/pass/infra/graphio/passgraphio_test.go](../calculation-engine/internal/pass/infra/graphio/passgraphio_test.go)<br>GobLoaderのEmptyReader / InvalidData | **1ケースへ統合**。どちらもgob.Decode失敗の伝播。 | 空入力だけを特別処理する将来変更は見逃す。現行に固有処理はなく、破損入力1件で伝播を保証。 |
| **C03** [calculation-engine/internal/pass/fare/calculator_test.go](../calculation-engine/internal/pass/fare/calculator_test.go)<br>TestInitRegistryの各社Get確認 | **運賃計算へ集約**。各社の正常登録はcalculator・統合テストが利用。 | 未対応会社の扱いは1件残す。各社の金額テストは削らない。 |
| **C04** [calculation-engine/internal/pass/domain/addon_test.go](../calculation-engine/internal/pass/domain/addon_test.go)<br>ResolveIDsの単一区間・複数区間 | **複数区間へ統合**。単一区間で確認する逆方向を複数区間側へ移せる。 | 逆方向の適用漏れを失わないよう移植。再初期化・未知駅など別分岐は残す。 |
| **C05** [calculation-engine/internal/ticket/infra/graphio/special_zone_loader_test.go](../calculation-engine/internal/ticket/infra/graphio/special_zone_loader_test.go)<br>TestSpecialZoneRegistryのStationToZones手作り部分 | **実loaderのケースへ置換**。逆引きmapをテストで構築して取得する。loaderが逆引きを作らなくても通る。 | 実loaderで既知駅・未知駅を1組確認してから削除。特定都区市内の認識失敗を検知できるようにする。 |
| **C06** [calculation-engine/cmd/api/deployment_test.go](../calculation-engine/cmd/api/deployment_test.go)<br>環境×HTTPステータスの全組合せ | **代表組合せへ縮小**。環境ヘッダーとHTTPステータスの独立軸の掛け算。 | production/staging/未設定は各1件。WriteだけとWriteHeaderの差は残す。組合せ固有の将来変更は検知範囲が狭くなる。 |
| **C07** [calculation-engine/cmd/api/main_test.go](../calculation-engine/cmd/api/main_test.go)<br>廃止fareルートのGET/POST重複 | **各廃止パス1件へ**。同じ未登録muxのGET/POSTを再確認。 | 将来片方のメソッドだけ再登録された場合の検知は減る。現行のルート定義を基準に各パス1件。 |
| **C08** [calculation-engine/cmd/api/pass_fallback_test.go](../calculation-engine/cmd/api/pass_fallback_test.go)<br>bin状態×券種×期間×条件×並行呼出し | **軸ごとに代表ケースへ**。同じfallback構築を多数反復。無効monthsも正常期間ループで重複。 | bin欠損・破損・不整合、pass/IC配線、1/3/6月の非ゼロ実額、並行アクセス1組を残す。全軸の相互作用網羅は手放す。 |
| **C09** [calculation-engine/internal/ticket/usecase/path_corrector_test.go](../calculation-engine/internal/ticket/usecase/path_corrector_test.go)<br>[calculation-engine/tests/integration/ticket/path_corrector_test.go](../calculation-engine/tests/integration/ticket/path_corrector_test.go)<br>TestPipelineCorrectorの既存3経路 | **統合側へ一本化**。同じ補正経路をモックID表と実グラフの両方で管理。 | 実グラフ側の期待経路を残す。補正前の新幹線情報を渡す専用テストは別契約なので維持。 |
| **C10** [calculation-engine/internal/ticket/usecase/suburban_area_corrector_test.go](../calculation-engine/internal/ticket/usecase/suburban_area_corrector_test.go)<br>[calculation-engine/tests/integration/ticket/suburban_area_corrector_test.go](../calculation-engine/tests/integration/ticket/suburban_area_corrector_test.go)<br>基本的な近郊区間最短化の成功ケース | **実グラフ側へ統合**。基本の短縮成功を重複検証。 | 私鉄混在・区間外・補正禁止は残す。単駅入力を削る際は公開入力の拒否契約を維持。 |
| **C11** [calculation-engine/internal/ticket/usecase/special_fare_rule_resolver_test.go](../calculation-engine/internal/ticket/usecase/special_fare_rule_resolver_test.go)<br>TestNormalizeFareEvaluationModeの正常値 | **公開計算テストへ統合**。文字列→列挙値の確認が既存mode別計算と重複。 | 未知modeの扱いは公開入口で1件確認してからヘルパー直接テストを削除。 |
| **C12** [calculation-engine/internal/ticket/usecase/via_test.go](../calculation-engine/internal/ticket/usecase/via_test.go)<br>[calculation-engine/tests/integration/ticket/via_result_test.go](../calculation-engine/tests/integration/ticket/via_result_test.go)<br>TestGetFareViaForResultShinkansenOverlap | **統合側に一本化**。TestFareViaWithShinkansenOverlapと同じ重複省略の具体経路。 | 補正済み/未補正、逆方向の独自条件は残す。同じ入力・結果だけを落とす。 |
| **C13** [calculation-engine/internal/ticket/usecase/via_test.go](../calculation-engine/internal/ticket/usecase/via_test.go)<br>TestGetFareViaShinkansenAndPrivateBoundaryのIRいしかわ重複 / TestOsakaShinOsakaViaBoundsSkipsVirtualEndpoint | **出力テストへ統合**。私鉄接続はTestPrivateConnectionCodesPreservePrintingと重複。boundsは内部位置の固定。 | 公開の経由表示へIR接続と仮想端点入力を移す。誤った線名表示・省略の検知は維持。 |
| **C14** [calculation-engine/internal/ticket/usecase/via_test.go](../calculation-engine/internal/ticket/usecase/via_test.go)<br>[calculation-engine/internal/pass/usecase/via_test.go](../calculation-engine/internal/pass/usecase/via_test.go)<br>規則の添字・件数から期待値を作る箇所 | **独立した代表経路へ置換**。規則のfrom/to・順序をexpectedに使うと規則自体の誤りを見逃す。 | 置換・省略・隣接判定の分岐別に人が定めた駅名と出力を残す。全規則の件数固定は削除。 |
| **C15** [calculation-engine/internal/ticket/usecase/via_log_test.go](../calculation-engine/internal/ticket/usecase/via_log_test.go)<br>TestCheapestViaLogUsesResultPathの経路×正逆×入力有無 | **ログ境界1組へ縮小**。経由表示はcheapest_via / cheapest_through_via / 統合テストで確認済み。多数のOS pipe捕捉は保守負担。 | 結果経路がログに採用される1件と不要な出力をしないケースを残す。各経路のログ差異は検知しなくなる。 |
| **C16** [calculation-engine/internal/ticket/usecase/osaka_city_distance_test.go](../calculation-engine/internal/ticket/usecase/osaka_city_distance_test.go)<br>TestOsakaZoneDistanceSummaryの内部集計比較 | **最終運賃へ移して削除**。集計構造体の形式に依存。 | 複数会社の距離集計が最終運賃を変える例を閾値・北新地ケースへ移してから削る。無条件削除は不可。 |
| **C17** [calculation-engine/tests/integration/pass/route_split_test.go](../calculation-engine/tests/integration/pass/route_split_test.go)<br>4経路×3期間×3mode | **代表組合せへ縮小**。二駅だけの経路でも全組合せで総当たり比較を反復。 | 附加額・バリアフリー料金の合成、補正mode差、期間料金を分担して残す。全組合せの相互作用は手放す。 |
| **C18** [calculation-engine/tests/integration/ticket/route_validation_test.go](../calculation-engine/tests/integration/ticket/route_validation_test.go)<br>9経路×正逆×3mode内のResolvePath | **mode外へ移動**。modeを受け取らないResolvePathを3回呼ぶ。 | 同じ入力の3回を1回へ。各公開入口が検証を迂回しない代表ケースは残す。境界経路の種類自体は維持。 |
| **C19** [calculation-engine/tests/integration/ticket/article70_shinkansen_test.go](../calculation-engine/tests/integration/ticket/article70_shinkansen_test.go)<br>mode内で同じnestedCorrect拒否確認 | **ループ外へ集約**。同一検証をmodeごとに反復。 | mode依存の計算結果は維持。時間効果は小さく、重複管理削減が目的。 |
| **C20** [calculation-engine/tests/integration/ticket/split_conventional_test.go](../calculation-engine/tests/integration/ticket/split_conventional_test.go)<br>WholeCorridorsの元JSON由来expected | **具体経路ケースへ集約**。変換元からexpectedを再構築し、同じ誤データを正解扱い。 | 具体的な正逆・部分区間・不成立ケースを残す。全データ検証が必要なら独立したデータ検証へ分離。 |

### 検証方式の置換

| ID / 対象 | 処置・根拠 | 削除で失う検知・残す最小保証 |
| --- | --- | --- |
| **R01** [calculation-engine/internal/pass/usecase/search_optimal_split_test.go](../calculation-engine/internal/pass/usecase/search_optimal_split_test.go)<br>precomputeFaresForTest / newParitySearch | **コピーした事前計算を固定行列へ**。双方向化・経路探索・遠回り判定をテストでも再実装。同じバグを正解にできる。 | 小グラフは手計算した行列に置換。生成器互換性は実生成器の専用1組へ。OneMonthしか設定しないfixtureの3/6月反復は削除。 |
| **R02** [calculation-engine/tests/integration/pass/cheapest_split_amount_test.go](../calculation-engine/tests/integration/pass/cheapest_split_amount_test.go)<br>setupSearchの暗黙mock fallback / generateMockPrecomputedBin | **統合と単体を分離しfallback削除**。../../data/precomputed/pass.binはパッケージ作業dirからtests/dataを指す。不在時にmockへ切替。 | 実データ必須の統合テストか明示的な小fixtureテストを選ぶ。ファイル不在を成功で隠さない。既存の小グラフ検索と重なるmockケースを削る。 |
| **R03** [tests/automation/deployment-verification.test.mjs](../tests/automation/deployment-verification.test.mjs)<br>workflow文字列split・正規表現 | **構造・有効権限検証へ置換**。YAML書式やジョブ配置に依存し、継承権限を文字列だけで評価できない。 | 資格情報なしbuild・承認環境・OIDC制限の境界は必要。継承を含めて判定してから文字列検査を削る。 |
| **R04** [tests/worker/engine-client.test.mjs](../tests/worker/engine-client.test.mjs)<br>TypeScriptソースの文字列置換import | **ローダーまたは依存注入へ集約**。import行・引用符・Worker生成式を変えるだけで通信契約が同じでも壊れる。 | リクエストID分離・進捗後の待機・完了後の抑止は必要。削るのはソース書換えの仕組み。 |
| **R05** [calculation-engine/internal/split/progress_test.go](../calculation-engine/internal/split/progress_test.go)<br>[calculation-engine/internal/split/fixed_route_split_test.go](../calculation-engine/internal/split/fixed_route_split_test.go)<br>実sleepと評価回数の厳密固定 | **時計注入・性能との分離**。実待機は揺らぎ、総評価回数の固定は枝刈り改善を妨げる。 | 途中進捗・エラー時の未完了・最安結果は残す。探索回数・確保量はbenchmarkへ。 |

### ブラウザ・実行費用の削減

| ID / 対象 | 処置・根拠 | 削除で失う検知・残す最小保証 |
| --- | --- | --- |
| **E01** [tests/browser/deferred-assets.spec.ts](../tests/browser/deferred-assets.spec.ts)<br>幅390/1600×通常/PWAの3ケース | **1ケースへ・実待機削減**。同じ広告不在を3回確認し各5500ms待機。計画上の累積待機16.5秒。 | 幅・standalone依存の再混入検知を一部手放す。配信成果物の広告参照検査と代表ページの通信確認を残す。累積時間と並列CIの壁時計短縮は別。 |
| **E02** [tests/browser/pwa.spec.ts](../tests/browser/pwa.spec.ts)<br>API失敗status×3券種 / フォント件数固定 | **statusを各券種へ配分・件数削除**。同じfallbackを全組合せで反復。フォント100以上などはライブラリ分割数に依存。 | 各endpoint→WASM配線、429/408等の異なる分岐を残す。フォントはオフライン読込と必要文字の表示を確認。 |
| **E03** [tests/browser/pass-validation.spec.ts](../tests/browser/pass-validation.spec.ts)<br>2経路×1/3/6月 | **会社形状2件と期間切替へ**。経路妥当性と料金期間の独立軸を総当たり。 | 会社境界の拒否と期間切替の再計算は残す。全経路×全期間の相互作用は手放す。 |
| **E04** [tests/browser/calculator-hydration.spec.ts](../tests/browser/calculator-hydration.spec.ts)<br>7ページSSRフォーム / 初期高さ / URL復元 | **静的検証と代表3フォームへ**。共有シェルに同じブラウザ処理・hydration待機を反復。 | 7ルートのSSRは静的に残す。自動検索・経路入力・分割入力のhydration、位置、復元を代表ケースに統合。 |
| **E05** [tests/browser/route-progress.spec.ts](../tests/browser/route-progress.spec.ts)<br>[tests/browser/route-split.spec.ts](../tests/browser/route-split.spec.ts)<br>本物WASMの進捗詳細 | **実WASM計算ケースへ統合**。Go側が単調性・完了条件を検証。ブラウザは入力→進捗→結果の接続が中心。 | ticket/pass配線は各1件。制御Workerで途中UI・失敗UIを確認するテストは有効で、mock自己検証ではない。 |
| **E06** [tests/browser/route-split.spec.ts](../tests/browser/route-split.spec.ts)<br>[calculation-engine/tests/integration/ticket/split_conventional_test.go](../calculation-engine/tests/integration/ticket/split_conventional_test.go)<br>熱海→小倉 / TestSplitConventionalLongRoute | **通常回帰から性能計測へ**。ブラウザは100秒の結果待ち・120秒timeout。Goも今回4.02秒。機能は短い代表で確認。 | 長距離特有のWASMメモリ不足・極端な遅延を通常CIで見逃す。長距離WASM計測は明示実行の性能ジョブへ残す。 |
| **E07** [tests/browser/route-split.spec.ts](../tests/browser/route-split.spec.ts)<br>パターン数2/3/1/0×幅・開閉 | **固定Worker応答、0/1/複数へ**。実計算後に応答を書換えてUI検証。実計算の費用が不要。 | 複数→1→0のリセット、キーボード開閉、フォーカス復元を残す。幅は狭い画面とPCの代表。 |
| **E08** [tests/browser/route-split.spec.ts](../tests/browser/route-split.spec.ts)<br>在来線置換・控除アルゴリズム比較 | **Goへ寄せてUI反映1組へ**。Go統合で具体経路・mode・正逆を検証済み。 | 候補駅の控除・禁止入力表示・WASMから結果が届くことは残す。公開アダプターの境界は消さない。 |
| **E09** [tests/browser/migration.spec.ts](../tests/browser/migration.spec.ts)<br>stale403/404 / API timeout実待機 | **stale1件・timeout制御時計へ**。403/404はworker/frontend側にもある。実15秒待機はUI保証に不要。 | 現行版fallback配線1件を残す。API timeout実行場所を制御できる時計を使い、Worker時計も進むとは仮定しない。 |
| **E10** [tests/browser/migration.spec.ts](../tests/browser/migration.spec.ts)<br>[tests/browser/header.spec.ts](../tests/browser/header.spec.ts)<br>記事mobileメニュー / PC・mobile往復 | **ナビケースを統合**。同じ開閉・遷移・戻るの重複。 | 記事islandなし・hover prefetch・スクロール解除を代表へ移す。mobile操作自体は維持。 |
| **E11** [tests/browser/migration.spec.ts](../tests/browser/migration.spec.ts)<br>[tests/browser/advanced-options.spec.ts](../tests/browser/advanced-options.spec.ts)<br>38px・色・padding・内部indicator不存在 | **利用結果へ置換・部分削除**。安全な見た目変更で失敗し、ライブラリDOM形式まで固定。 | Emotion style消失後の入力可視性・入力幅・非露出live region・横はみ出しは維持。任意の色・px変更は許容。 |
| **E12** [tests/browser/advanced-options.spec.ts](../tests/browser/advanced-options.spec.ts)<br>320/390/1280の同じ操作 / monthsの2券種×5入力 | **幅と正規化の軸を分離**。幅別の同じ選択操作と旧month正規化の全件反復。 | 最小幅レイアウトとPC、months優先・旧month互換・券種別endpointを分担。料金の期間選択は別テストへ。 |
| **E13** [tests/browser/station-virtualization.spec.ts](../tests/browser/station-virtualization.spec.ts)<br>2フォームの全キー操作 / 全スクロール走査 | **共有部品の代表へ**。同じ仮想リスト操作をフォームごとに反復。 | 片方で全操作、他方はデータと反映。先頭・中間・末尾・同名駅を残す。全項目の欠落検知は小さいindex対応検証へ移す。touchとariaは維持。 |
| **E14** [tests/browser/articles.spec.ts](../tests/browser/articles.spec.ts)<br>[tests/browser/migration.spec.ts](../tests/browser/migration.spec.ts)<br>metadata・同じ内部リンクHTTP確認・データ算術 | **静的成果物検証へ集約**。ブラウザ不要の内容とURL重複取得。 | 全metadata・リンク切れはURL重複排除して保持。ブラウザはmobile・JSなしと計算リンク代表。request-onlyは元からブラウザを起動しないため移動だけの速度改善は断定しない。 |
| **E15** [tests/browser/public-api-docs.spec.ts](../tests/browser/public-api-docs.spec.ts)<br>catalogとstationData全一致 / 名称set・件数重複 / 文言列挙 | **契約チェックへ集約**。元データexpectedの全一致と派生集計を重ねる。文言固定も脆い。 | 公開schema・operation・曖昧駅名・期間キー・Content-Typeを残す。コピー比較の重複と変更可能な説明文固定を削る。 |
| **E16** [tests/browser/migration.spec.ts](../tests/browser/migration.spec.ts)<br>関連情報の旧文言不在・リンク数6 | **部分削除**。過去文章や件数の固定は利用可能性と結び付かない。 | 見出し・リンク先・横はみ出しを維持。旧文言だけの復活は許容。FAQ構造化データはSEO契約として別判断。 |
| **E17** [tests/browser/pwa.spec.ts](../tests/browser/pwa.spec.ts)<br>通常閲覧のSW未登録を複数ページで確認 | **1遷移シナリオへ**。home/changelogの同じ未登録確認。 | 遷移後も未登録を1本に残す。インストール版と通常版の区別は維持。 |
| **E18** [tests/browser/advanced-options.spec.ts](../tests/browser/advanced-options.spec.ts)<br>[tests/browser/calculator-hydration.spec.ts](../tests/browser/calculator-hydration.spec.ts)<br>[tests/browser/route-progress.spec.ts](../tests/browser/route-progress.spec.ts)<br>比較しないpage.screenshot保存 | **削除**。保存だけで成否に影響せず、実行・ディスク・成果物の費用。 | 成功時の手動確認画像は失う。失敗時画像はPlaywright設定で採取。 |
| **E19** [tests/dev/startup.spec.ts](../tests/dev/startup.spec.ts)<br>[tests/dev/public-api.spec.ts](../tests/dev/public-api.spec.ts)<br>事前計算なし起動のpass/IC各3期間と文書APIの重複 | **起動配線と期間選択を分担**。Go API fallbackで期間別実額を検証し、devでも7回ブラウザ計算。 | dev独自の事前計算なし起動・3endpoint・配信WASM runtime一致を維持。1/3/6月対応はAPI契約側へ。 |

## 削らない検証とその理由

- 運賃の会社境界、距離帯の直前・直後、特例の順逆、補正禁止、私鉄接続、都区市内閾値は異なる金額を返し得る。テーブル行数だけで削らない。ticketとpassの同名テストも実装・規則が別なので一括統合しない。
- 最適分割の総当たり参照解はDPと違う方法で正解を求める独立したoracle。実装コピーとは区別して維持する。
- HTTP転送先制限、資格情報除去、エラー非キャッシュ、Service Workerのorigin/版整合、アーカイブのパストラバーサル・symlink・重複パス・権限拒否は異なる保護境界。mockを使っても本体の拒否処理を通るため自己検証ではない。
- strict JSON loaderの未知キー・余剰入力拒否は設定境界。ライブラリに任せるだけでは成立しない。パス入力の不正・重複・切断も維持する。
- Workerのクライアント間ID分離、完了前進捗、二重初期化防止、API→WASM fallback、SWオフライン更新は利用者に影響する。低レベルの計算一致だけでは代替できない。
- network障害とHTTP 503、初回404と再試行、touchとキーボード、更新成功と容量不足は異なる障害経路。似た画面になるだけでは統合しない。
- 署名claimとキャッシュ期限は自前の組立・更新判定を検証するため維持。ただしclaimを読むテストは暗号署名自体を検証していない。タイトルだけで暗号検証済みとは見なさない。

## 精査時の実測と検証範囲（変更前の記録）

- npm run lint: 修正前11 warnings、修正後0 errors / 0 warnings。全体のrule無効化はしていない。
- node --test tests/worker/*.test.mjs tests/automation/*.test.mjs tests/verification/*.test.mjs: 81 tests成功、失敗0（今回約0.61秒）。短いNodeケースは主に保守負担削減で、大きな時間短縮は期待しない。
- GOCACHE=/private/tmp/kippu-navi-test-audit-go-cache go test -json ./...（calculation-engine）: テストのある20 packages成功、失敗0。TestSplitConventionalLongRouteは4.02秒。通常Go実行ではjs/wasm限定テストは実行されない。
- Pythonのartifact検証は7 tests成功。ランタイム版整合チェックとバージョン判定の代表的な正常・異常入力で変更前後の一致を確認。
- ブラウザE2E・開発サーバーE2E、Renovate専用スケジュール実行は今回実行していない。E欄は反復・明示待機からの提案で、削除後のCI壁時計時間を実測したものではない。
- lint修正はNodeバージョン判定の分割、等価なバージョン正規表現、許可済み環境の明示選択、固定URL読込への局所ESLint抑制。テスト件数・製品挙動は変更していない。

## 2026-10-24：成果物検証のJS移行に伴う追加テストの再評価

独自tarを廃止した後の責務に合わせ、追加ケースを次のように精査した。件数ではなく、削除すると見逃す公開事故と、別の拒否条件に隠されず検証できるかで判断した。

| 対象 | 判断と理由 |
| --- | --- |
| API・frontend・Sentryの正常受け渡し | 維持。異なる必須ファイルと転送後の配置、生成attemptによる照合を確認する。APIのCLI確認はここへ統合し、専用の重複した正常系は削除 |
| manifestの改変 | 維持。取得内容だけでなくビルド出力に固定したハッシュを照合する境界。期待ハッシュの入力例の列挙は集約 |
| SHA・環境・run・attempt・release・種別 | 維持。別の公開対象の成果物を誤って使わない境界。各値を単独で変更する |
| ファイル改変・欠落・追加 | 維持。内容の変更とファイル集合の増減は別の事故。欠落対象は必須ファイル検査に隠れない任意CSSへ変更 |
| 公開不可ファイル | 維持。設定ファイル、sourcemap、実行スクリプト、Workerの余分なファイル、隠しファイル・隠しディレクトリ、バックスラッシュを別々に確認。package-lockはpackage.jsonと重複するため削除。`.env`は拡張子でも拒否されるため、隠しパス検査が必要な`.secret.json`へ変更 |
| manifestだけに書いた不正パス7例 | 削除。実在ファイル一覧との不一致でも失敗し、パス検査の有効性を立証しない。アーカイブ展開の親参照・絶対パス処理はActions側の責務。自前コードでは実在する隠しパス・バックスラッシュとリンクを検査 |
| symlink・hardlink・FIFO・実行権限 | 維持。ファイル、配下ディレクトリ、ルートのリンクは追跡を止める場所が異なる。hardlinkはsymlink検査では拒否できず、FIFOはハッシュ読込の停止を防ぐ。setuidの専用例は権限検査との重複と環境依存のため削除 |
| manifestの欠落・サイズ上限 | 維持。検証情報の欠落と読込前の容量制限を確認。null・配列・不正JSONの列挙は削除し、構造比較や標準JSON解析の細部を固定しない |
| 成果物の容量上限 | 維持。巨大ファイルをハッシュ計算前に拒否する。sparse fileを使い大容量の実書込を避ける |
| manifestも整合する必須ファイル欠落 | 維持。ファイル一覧・ハッシュが正しくても公開できない不完全成果物を拒否する |
| deployment.json | 維持。manifestとは別の配信メタデータの取り違えを拒否する。commitとenvironmentを同時に変えていた例を、片方ずつ変える検証へ修正 |
| 既存出力先・壊れたsymlink | 維持。古い成果物との混在や出力先の上書きを防ぐ。通常の存在確認では見落とす壊れたリンクも確認 |
| 生成側の拒否ケース | 空の成果物・既存manifestだけ維持。検証側と同じ共通処理を通るリンク・公開不可ファイル・SHA形式の列挙は削除 |
| workflowの転送・検証順序 | 既存の`tests/automation/deployment-verification.test.mjs`へ集約。bundleの直接転送、`.well-known`の同梱、ID・manifestハッシュの対応、資格情報付与前の検証を確認。setup-nodeの単なる記述確認は削除 |

一時コピーでmanifest照合・ファイルハッシュ・許可パス・必須成果物・deploymentのcommit／environment照合をそれぞれ無効にし、対応テストが期待した拒否の欠落として失敗することを確認した。Actionsによる実転送・リモートCI・デプロイの成功を証明するものではない。

## 全テストファイルの確認記録

「維持」は全assertを永久に残す意味ではなく、今回の基準で具体的な削除対象を見いだしていないという意味。IDのあるファイルも、それ以外の固有の回帰条件は維持する。

| ファイル | 処置 |
| --- | --- |
| [calculation-engine/cmd/api/deployment_test.go](../calculation-engine/cmd/api/deployment_test.go) | C06 |
| [calculation-engine/cmd/api/main_test.go](../calculation-engine/cmd/api/main_test.go) | C07 |
| [calculation-engine/cmd/api/observability_test.go](../calculation-engine/cmd/api/observability_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/cmd/api/pass_fallback_test.go](../calculation-engine/cmd/api/pass_fallback_test.go) | D13, C08 |
| `calculation-engine/cmd/scan-article114/debug_aizu_test.go`（削除済み） | D04 |
| `calculation-engine/cmd/scan-article114/debug_hoshimi_test.go`（削除済み） | D05 |
| [calculation-engine/cmd/scan-article114/scanner_test.go](../calculation-engine/cmd/scan-article114/scanner_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/cmd/wasm/ticket_initialization_test.go](../calculation-engine/cmd/wasm/ticket_initialization_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/domain/path_validation_test.go](../calculation-engine/internal/domain/path_validation_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/domain/addon_test.go](../calculation-engine/internal/pass/domain/addon_test.go) | C04 |
| `calculation-engine/internal/pass/domain/bypass_test.go`（削除済み） | D06 |
| [calculation-engine/internal/pass/fare/barrier_free_test.go](../calculation-engine/internal/pass/fare/barrier_free_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/fare/calculator_test.go](../calculation-engine/internal/pass/fare/calculator_test.go) | C03 |
| [calculation-engine/internal/pass/fare/joint_test.go](../calculation-engine/internal/pass/fare/joint_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/fare/path_matcher_internal_test.go](../calculation-engine/internal/pass/fare/path_matcher_internal_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/fare/path_matcher_test.go](../calculation-engine/internal/pass/fare/path_matcher_test.go) | C01 |
| [calculation-engine/internal/pass/fare/train_specific_sections_test.go](../calculation-engine/internal/pass/fare/train_specific_sections_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/graph/graph_test.go](../calculation-engine/internal/pass/graph/graph_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/graph/ic_pass_graph_test.go](../calculation-engine/internal/pass/graph/ic_pass_graph_test.go) | D13 |
| [calculation-engine/internal/pass/handler/split_test.go](../calculation-engine/internal/pass/handler/split_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/infra/fareio/json_loader_test.go](../calculation-engine/internal/pass/infra/fareio/json_loader_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/infra/graphio/passgraphio_test.go](../calculation-engine/internal/pass/infra/graphio/passgraphio_test.go) | C02 |
| [calculation-engine/internal/pass/usecase/calculate_amount_test.go](../calculation-engine/internal/pass/usecase/calculate_amount_test.go) | D08 |
| [calculation-engine/internal/pass/usecase/find_optimal_split_test.go](../calculation-engine/internal/pass/usecase/find_optimal_split_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/usecase/route_pass_test.go](../calculation-engine/internal/pass/usecase/route_pass_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/pass/usecase/search_optimal_split_scratch_test.go](../calculation-engine/internal/pass/usecase/search_optimal_split_scratch_test.go) | D12 |
| [calculation-engine/internal/pass/usecase/search_optimal_split_test.go](../calculation-engine/internal/pass/usecase/search_optimal_split_test.go) | R01 |
| [calculation-engine/internal/pass/usecase/via_test.go](../calculation-engine/internal/pass/usecase/via_test.go) | C14 |
| [calculation-engine/internal/split/fixed_route_split_test.go](../calculation-engine/internal/split/fixed_route_split_test.go) | R05 |
| [calculation-engine/internal/split/progress_test.go](../calculation-engine/internal/split/progress_test.go) | R05 |
| [calculation-engine/internal/ticket/data/loader_test.go](../calculation-engine/internal/ticket/data/loader_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/fare/barrier_free_test.go](../calculation-engine/internal/ticket/fare/barrier_free_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/fare/east_test.go](../calculation-engine/internal/ticket/fare/east_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/fare/hokkaido_test.go](../calculation-engine/internal/ticket/fare/hokkaido_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/fare/joint_test.go](../calculation-engine/internal/ticket/fare/joint_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/fare/kyushu_test.go](../calculation-engine/internal/ticket/fare/kyushu_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/fare/path_matcher_test.go](../calculation-engine/internal/ticket/fare/path_matcher_test.go) | C01 |
| [calculation-engine/internal/ticket/fare/shikoku_test.go](../calculation-engine/internal/ticket/fare/shikoku_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/fare/standard_test.go](../calculation-engine/internal/ticket/fare/standard_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/fare/train_specific_section_test.go](../calculation-engine/internal/ticket/fare/train_specific_section_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| `calculation-engine/internal/ticket/graph/graph_test.go`（削除済み） | D10 |
| [calculation-engine/internal/ticket/handler/split_test.go](../calculation-engine/internal/ticket/handler/split_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/infra/fareio/json_loader_test.go](../calculation-engine/internal/ticket/infra/fareio/json_loader_test.go) | D07, D11 |
| [calculation-engine/internal/ticket/infra/graphio/json_test.go](../calculation-engine/internal/ticket/infra/graphio/json_test.go) | D13 |
| [calculation-engine/internal/ticket/infra/graphio/special_zone_loader_test.go](../calculation-engine/internal/ticket/infra/graphio/special_zone_loader_test.go) | C05 |
| [calculation-engine/internal/ticket/usecase/apply_osaka_shinosaka_test.go](../calculation-engine/internal/ticket/usecase/apply_osaka_shinosaka_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/usecase/apply_special_zone_test.go](../calculation-engine/internal/ticket/usecase/apply_special_zone_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/usecase/calculate_amount_test.go](../calculation-engine/internal/ticket/usecase/calculate_amount_test.go) | D09 |
| [calculation-engine/internal/ticket/usecase/cheapest_through_via_test.go](../calculation-engine/internal/ticket/usecase/cheapest_through_via_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/usecase/cheapest_via_test.go](../calculation-engine/internal/ticket/usecase/cheapest_via_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/usecase/osaka_city_distance_test.go](../calculation-engine/internal/ticket/usecase/osaka_city_distance_test.go) | C16 |
| [calculation-engine/internal/ticket/usecase/path_corrector_test.go](../calculation-engine/internal/ticket/usecase/path_corrector_test.go) | C09 |
| [calculation-engine/internal/ticket/usecase/route_extension_test.go](../calculation-engine/internal/ticket/usecase/route_extension_test.go) | D07 |
| [calculation-engine/internal/ticket/usecase/route_ticket_test.go](../calculation-engine/internal/ticket/usecase/route_ticket_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/usecase/route_validation_test.go](../calculation-engine/internal/ticket/usecase/route_validation_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/usecase/search_optimal_split_test.go](../calculation-engine/internal/ticket/usecase/search_optimal_split_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/usecase/special_fare_rule_resolver_test.go](../calculation-engine/internal/ticket/usecase/special_fare_rule_resolver_test.go) | C11 |
| [calculation-engine/internal/ticket/usecase/split_conventional_test.go](../calculation-engine/internal/ticket/usecase/split_conventional_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/internal/ticket/usecase/suburban_area_corrector_test.go](../calculation-engine/internal/ticket/usecase/suburban_area_corrector_test.go) | C10 |
| [calculation-engine/internal/ticket/usecase/via_log_test.go](../calculation-engine/internal/ticket/usecase/via_log_test.go) | C15 |
| [calculation-engine/internal/ticket/usecase/via_test.go](../calculation-engine/internal/ticket/usecase/via_test.go) | C12, C13, C14 |
| [calculation-engine/tests/integration/pass/amount_test.go](../calculation-engine/tests/integration/pass/amount_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/tests/integration/pass/cheapest_split_amount_test.go](../calculation-engine/tests/integration/pass/cheapest_split_amount_test.go) | R02 |
| [calculation-engine/tests/integration/pass/route_split_test.go](../calculation-engine/tests/integration/pass/route_split_test.go) | C17 |
| [calculation-engine/tests/integration/pass/via_test.go](../calculation-engine/tests/integration/pass/via_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/tests/integration/ticket/amount_test.go](../calculation-engine/tests/integration/ticket/amount_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/tests/integration/ticket/article70_shinkansen_test.go](../calculation-engine/tests/integration/ticket/article70_shinkansen_test.go) | C19 |
| [calculation-engine/tests/integration/ticket/cheapest_through_via_test.go](../calculation-engine/tests/integration/ticket/cheapest_through_via_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/tests/integration/ticket/osaka_city_distance_test.go](../calculation-engine/tests/integration/ticket/osaka_city_distance_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/tests/integration/ticket/osaka_via_test.go](../calculation-engine/tests/integration/ticket/osaka_via_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/tests/integration/ticket/path_corrector_test.go](../calculation-engine/tests/integration/ticket/path_corrector_test.go) | C09 |
| [calculation-engine/tests/integration/ticket/route_split_test.go](../calculation-engine/tests/integration/ticket/route_split_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/tests/integration/ticket/route_validation_test.go](../calculation-engine/tests/integration/ticket/route_validation_test.go) | C18 |
| [calculation-engine/tests/integration/ticket/split_conventional_test.go](../calculation-engine/tests/integration/ticket/split_conventional_test.go) | C20, E06 |
| [calculation-engine/tests/integration/ticket/suburban_area_corrector_test.go](../calculation-engine/tests/integration/ticket/suburban_area_corrector_test.go) | C10 |
| [calculation-engine/tests/integration/ticket/suburban_split_test.go](../calculation-engine/tests/integration/ticket/suburban_split_test.go) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [calculation-engine/tests/integration/ticket/via_result_test.go](../calculation-engine/tests/integration/ticket/via_result_test.go) | C12 |
| [scripts/test-renovate-schedule.mjs](../scripts/test-renovate-schedule.mjs) | D14 |
| [tests/automation/deployment-verification.test.mjs](../tests/automation/deployment-verification.test.mjs) | R03 |
| [tests/automation/staging.test.mjs](../tests/automation/staging.test.mjs) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [tests/browser/advanced-options.spec.ts](../tests/browser/advanced-options.spec.ts) | E11, E12, E18 |
| [tests/browser/articles.spec.ts](../tests/browser/articles.spec.ts) | E14 |
| [tests/browser/calculator-hydration.spec.ts](../tests/browser/calculator-hydration.spec.ts) | E04, E18 |
| [tests/browser/deferred-assets.spec.ts](../tests/browser/deferred-assets.spec.ts) | E01 |
| [tests/browser/header.spec.ts](../tests/browser/header.spec.ts) | E10 |
| [tests/browser/migration.spec.ts](../tests/browser/migration.spec.ts) | E09, E10, E11, E14, E16 |
| [tests/browser/pass-validation.spec.ts](../tests/browser/pass-validation.spec.ts) | E03 |
| [tests/browser/public-api-docs.spec.ts](../tests/browser/public-api-docs.spec.ts) | E15 |
| [tests/browser/pwa-update.spec.ts](../tests/browser/pwa-update.spec.ts) | D03 |
| [tests/browser/pwa.spec.ts](../tests/browser/pwa.spec.ts) | E02, E17 |
| [tests/browser/route-progress.spec.ts](../tests/browser/route-progress.spec.ts) | E05, E18 |
| [tests/browser/route-split.spec.ts](../tests/browser/route-split.spec.ts) | E05, E06, E07, E08 |
| [tests/browser/station-virtualization.spec.ts](../tests/browser/station-virtualization.spec.ts) | E13 |
| [tests/deploy/artifact.test.mjs](../tests/deploy/artifact.test.mjs) | 維持：固有の計算・入力・配信・保護境界の検証。2026-10-24にPython版からJS版のディレクトリ成果物検証へ移行 |
| [tests/dev/public-api.spec.ts](../tests/dev/public-api.spec.ts) | E19 |
| [tests/dev/startup.spec.ts](../tests/dev/startup.spec.ts) | E19 |
| [tests/verification/http.test.mjs](../tests/verification/http.test.mjs) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [tests/verification/policy.test.mjs](../tests/verification/policy.test.mjs) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [tests/worker/api.test.mjs](../tests/worker/api.test.mjs) | D01 |
| [tests/worker/deferred-third-party.test.mjs](../tests/worker/deferred-third-party.test.mjs) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [tests/worker/engine-client.test.mjs](../tests/worker/engine-client.test.mjs) | R04 |
| [tests/worker/frontend.test.mjs](../tests/worker/frontend.test.mjs) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [tests/worker/pwa-headers.test.mjs](../tests/worker/pwa-headers.test.mjs) | 維持：固有の計算・入力・配信・保護境界の検証 |
| [tests/worker/pwa.test.mjs](../tests/worker/pwa.test.mjs) | D02 |
