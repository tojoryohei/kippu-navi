# 経路計算E2Eの責務

Goの統合テストは展開済みの駅・路線を入力する。URL解析、フロント側の経路展開、
Worker/WASMの受け渡し、DOM表示は検証しない。したがって「計算条件の網羅」を
Goに集約しても、実WASMを通した代表ケースはE2Eに残す。

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
