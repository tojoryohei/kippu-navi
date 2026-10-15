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
| 定期券の期間・モード別金額 | `pass/route_split_test.go`: `TestRoutePassSplitAgainstEnumeration`（1/3/6箇月×3モード、料金・加算額と全分割案を照合） | 6箇月の金額比較。別の遷移テストで1/3/6箇月のURL・表示切替も維持 |
| 最安経由表示5経路 | `ticket/cheapest_through_via_test.go`: `TestCheapestThroughDedicatedStations`（3経路）と `TestCheapestThroughReplacementDuplicate`（2経路）、各双方向 | 三島→静岡→東静岡の実WASM結果が画面上の経由文字列になること |

この整理は、削除した全URL入力のブラウザ経路を同等に網羅するものではない。
計算ルールの組合せはGo、ブラウザとの接続は代表ケースに責務を分ける。

## 削除しないもの

- 熱海→小倉の無制限分割はWASM固有の実行・資材・メモリの回帰を検出するため維持。
  Goの `TestSplitConventionalLongRoute` はログと異なり新下関までしか入力していなかったため、小倉まで延長した。
- 古いエンジンURLの403/404からの復旧はブラウザWorker側の処理。
  `tests/worker/frontend.test.mjs` の `fetchEngineAsset` はサーバー側であり代替ではない。
- 初期HTML、hydration前後の高さ、長い駅名の入力幅、候補行の可変高、モバイルのはみ出し、キーボード操作はブラウザ固有のため復元。
- 定期券の私鉄拒否、券種ごとのAPIフォールバック、実WASM進捗は、この変更では下位の同等保証を追加していないため復元。

## 計算以外の整理

`SplitResults` は経路自動検索・経路入力検索で共用されているため、追加パターンの
0/1/2/3件境界と再計算時の折りたたみは自動検索の乗車券で代表検証する。
他画面への接続は各画面の実計算E2Eで確認し、ボタンの画面内収まりも維持する。
CSSクラス名の完全一致と、期待画像と比較しないスクリーンショット保存だけを削除する。
