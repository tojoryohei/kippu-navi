# 経路計算E2Eの責務

Goの統合テストは展開済みの駅・路線を入力する。URL解析、フロント側の経路展開、
Worker/WASMの受け渡し、DOM表示は検証しない。したがって「計算条件の網羅」を
Goに集約しても、実WASMを通した代表ケースはE2Eに残す。

## 実物を通す境界と差し替える境界

| テスト群 | 実物を通す境界 | 差し替える境界 | 検出する不具合・保証の限界 |
| --- | --- | --- | --- |
| `tests/dev/startup.spec.ts`、`public-api.spec.ts` | 入力・URL→ローカルGo API→Worker/WASM→結果表示（HTTPのみのケースも含む） | 広告・計測の外部通信を遮断。APIは事前計算なし | API契約、券種・期間、入力から画面への接続。Cloudflare本番配信の保証ではない |
| `migration.spec.ts`、`route-split.spec.ts` の実計算 | URL解析・経路展開→実Worker/WASM・BIN→画面 | 自動検索APIは固定応答または明示的な障害。経路入力はAPI不要 | フロントと計算エンジンの結合。固定APIが返す経路の探索品質は保証しない |
| `tests/dev/ticket-pricing.spec.ts` | 割引・単駅指定の操作→実WASM→画面・URL復元 | 広告・計測を遮断 | UI設定の受け渡し。金額の代表値は固定し、割引の全組み合わせはGo/WASMテストに委ねる |
| `route-progress.spec.ts`、`split-streaming.spec.ts` | フォーム・進捗・結果表示 | 制御Worker（自動検索APIも固定・遮断） | 時系列・古い通知の拒否・復旧UI。計算精度や実Workerの動作を保証するE2Eとは区別する |
| `engine-readiness.spec.ts`、`calculator-hydration.spec.ts` | hydration・実エンジン準備・再試行 | 資材の遅延・取得失敗を明示的に注入 | 準備中の操作制約と復旧。タイムアウトの境界値は下位テストで確認 |
| `pwa.spec.ts`、`pwa-update.spec.ts` | ビルド済み資材・Service Worker・Cache Storage・複数タブ | オフライン、API障害、新版の資材・取得失敗 | 保存・更新・次回起動の結合。通常ページの通信fixtureとは分けて制御 |
| 駅候補・ヘッダー・記事・詳細オプション | 実DOM・キーボード・画面幅・画面遷移 | 必要に応じAPI固定・外部通信遮断 | UIの操作性、表示、入力引き継ぎ。計算規則の網羅は目的にしない |

代表の実APIテストは新茂原→茂原の2.9kmを使用する。乗車券160円、
3箇月定期13,960円、6箇月IC定期26,620円をテスト内の固定値とし、
実行時のAPI/Worker応答から期待値を算出しない。根拠は各テストのコメントを参照。
乗車券は空フォームから候補を選んで検索する。URL直アクセス・再読み込みの保証は
`migration.spec.ts` と定期券の起動テストに残す。

## 状態遷移の代表保証

| 遷移・拒否すべき操作 | 既存テスト | 実行方式 |
| --- | --- | --- |
| 準備中→計算可能、準備中のEnter拒否、入力変更で自動検索取消 | `engine-readiness.spec.ts` | 実WASM資材の取得を明示的に解除 |
| 初期読込失敗→メインボタンから再試行→完了 | `calculator-hydration.spec.ts`、`migration.spec.ts` | 実Worker/WASMの通信障害を注入 |
| 計算中→探索・割合・整理→失敗→再試行→完了 | `route-progress.spec.ts` | 制御Worker。旧進捗・成功・エラーが新しい状態を上書きしない |
| 計算中→部分結果→追加表示→途中失敗→再計算→完了 | `split-streaming.spec.ts` | 制御Worker。online/offline両経路で旧部分結果・成功・エラーを拒否 |
| 実計算→進捗→最終結果 | `route-split.spec.ts` | 実WASMの既存計算ケース内で検証 |
| 新版保存失敗→再取得→待機→全旧画面終了→新版起動 | `pwa-update.spec.ts` | 実Service Workerと複数タブ |

制御Workerの通知後は描画フレームを待ってから否定アサーションを行う。
メッセージ順序を意図的に制御するテストと、実通信・実計算の結合テストの両方を維持する。

## 診断と実行結果

- browser/devの全specは `tests/support/fixtures.ts` のtest/expectを使う。fixtureは通信を差し替えず、
  BrowserContext内のページ例外・通信失敗・HTTPエラーを収集し、失敗時だけ `browser-diagnostics` JSONを添付する。
  HTTPエラーを一律に失敗判定へ変換しない。ログは最大500件、超過件数も記録する。
- `blockExternalServices` は広告・計測などの遮断に理由を付ける。障害注入は
  `diagnostics.expectFailure({ kind, url, status, reason })` で対象を明示できる。
  登録は診断上の分類であり、成功判定や既存アサーションを変更しない。未分類は想定外と断定せず調査対象として扱う。
- fixture外で作るBrowserContextは `diagnostics.observe(context)` を呼ぶ。
  PWAの通信制御は専用実装を維持し、Service Worker経由の通信すべてをこのログだけで捕捉できるとはみなさない。
- 成果物は `test-results/browser` と `test-results/dev`、HTML/JSONレポートは
  `playwright-report/browser` と `playwright-report/dev` に分離する。CIは成否を問わず7日保存する。
  browserが失敗してもdevは実行し、両方の結果を残す（キャンセル時は除く）。
- 通常CIの全件実行、2 workers、リトライなしを維持する。変更した非同期ケースは
  `--repeat-each=5 --retries=0` で別途検証し、速度比較には同じブラウザ・環境のJSONレポートを使う。

### 改善時の検証記録（2026-11-08〜09）

| スイート | 変更前 | 最新main統合後 |
| --- | --- | --- |
| browser | 成功97・失敗1、76.7秒 | 成功98・失敗0、77.6秒 |
| dev | 成功17・性能テストのスキップ2、37.5秒 | 成功17・性能テストのスキップ2、35.9秒 |

- 件数を増やさず既存ケースを強化した。変更前の失敗は詳細オプションのキーボード選択で、
  hydration完了とメニュー・フォーカス状態の待機を追加した。検証対象のキー操作と期待値は維持している。
- pull前に非同期ケースをリトライなしで5回反復し、browser 22ケース×5回=110件、
  dev 11ケース×5回=55件が成功した。
- 統合後の全件検証は `7d3b501` 上の作業差分に対して実施。macOSのChromeを
  `PLAYWRIGHT_CHANNEL=chrome` で利用した。CIのChromiumでの実行結果とは区別する。
  pullでNode.js 24.19.0→26.13.0とAstro等の依存関係が変わったため、上表は高速化の根拠にしない。
- 一時的な失敗ケースをbrowser/devで実行し、trace・スクリーンショット・ページ例外と
  注入した通信失敗の診断ログ・HTML/JSONレポートを確認した。両保存先の共存も確認し、一時ケースは削除した。
- ESLint、型検査、Knip、automation/verificationの24件、actionlintが成功した。
  actionlintはShellCheckを無効にして実行した（今回の変更にシェル処理の追加はない）。
  型検査とビルドの同時実行ではAstroキャッシュが競合したため、最終の型検査は単独で実施した。

## route-split.spec.tsで減らした組合せと下位テスト

Go側のパスは `calculation-engine/tests/integration/` を基準とする。

| 検証対象 | 下位テスト | E2Eに残す保証 |
| --- | --- | --- |
| 新幹線展開後の重複拒否 | `ticket/route_validation_test.go`: `TestRouteTicketRejectsOverlapBeforeModeCorrection`（双方向・3モード）、`TestRouteTicketRejectsReturnToOrioAfterRule43_2` | 新下関→小倉→門司を運賃・分割の両ページで実行し、実Workerエラーと画面表示を確認 |
| 第43条の2適用後の運賃・分割整合、候補駅除外 | 同ファイルの `TestRouteTicketKyushuValidationKeepsFareAndSplitRoutes`（双方向・3モード） | 新下関→柚須で両ページの金額と候補チェックボックスを確認 |
| 隣接区間の乗車券 | `ticket/route_split_test.go`: `TestRouteSplitRealRoutesAndModes`（3モード）。単一案・単一区間・基準額一致を追加 | 通常モードの金額、再読み込み、逆転、最安モードへの切替 |
| 定期券の期間・モード別金額 | `pass/route_split_test.go`: `TestRoutePassSplitAgainstEnumeration`（1/3/6箇月・3モード・料金構成を分担した6ケースで全分割案を照合） | 6箇月の金額比較。別の遷移テストで1/3/6箇月のURL・表示切替も維持 |
| 最安経由表示5経路 | `ticket/cheapest_through_via_test.go`: `TestCheapestThroughDedicatedStations`（3経路）と `TestCheapestThroughReplacementDuplicate`（2経路）、各双方向 | 三島→静岡→東静岡の実WASM結果が画面上の経由文字列になること |

この整理は、削除した全URL入力のブラウザ経路を同等に網羅するものではない。
計算ルールの組合せはGo、ブラウザとの接続は代表ケースに責務を分ける。

## 実行場所と維持する保証

- 熱海→小倉の長距離計算は明示実行する性能テストへ分離した。WASMは
  `RUN_PERFORMANCE_TESTS=1 npx playwright test --grep @performance`、
  Goは `go test ./tests/integration/ticket -run '^$' -bench '^BenchmarkSplitConventionalLongRoute$' -benchtime=1x`
  （calculation-engineで実行）。通常CIでは長距離固有のメモリ・性能回帰を検知しない。
- 古いエンジンURLの403/404は両方維持する。ブラウザWorkerの復旧処理と
  `tests/worker/frontend.test.mjs` のサーバー側fetchEngineAssetは別の境界。
- 全7ルートの初期SSRはHTTPで確認し、代表3フォームのhydration・URL復元・高さ・操作解除はブラウザで確認する。
- 会社線拒否は2形状、API fallbackは各券種とstatusの分岐を分担する。
  実WASMの進捗受信は既存の計算ケースへ統合し、割合・エラー・再計算UIは制御Workerで確認する。
- 仮想リストは全キー操作を代表フォームへ集約する一方、同名駅やデータの違いを検出する全候補スクロール、touch、読み上げ対象の保持は維持する。

## 計算以外の整理

`SplitResults` は経路自動検索・経路入力検索で共用されているため、追加パターンの
0/1/複数件境界と再計算時の折りたたみは固定Worker応答を使った自動検索の乗車券で代表検証する。
他画面への接続は各画面の実計算E2Eで確認し、ボタンの画面内収まりも維持する。
CSSクラス名の完全一致と、期待画像と比較しないスクリーンショット保存だけを削除する。

全候補の採否・実測は [テスト精査と反映結果](../../docs/test-audit-2026-10-23.md) を参照。
