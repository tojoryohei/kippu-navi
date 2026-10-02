# Sentry 未解決 Issue の調査記録（2026-10-02）

対象は `javascript-astro` の調査開始時の未解決 Issue 16 件（同一原因のマージ後）。各 Issue の判断と次の作業を Sentry のアクティビティにも記録した。1T と 17 は固有のブラウザ遷移中断として理由付きで「Until escalating」にアーカイブしたため、作業後の未解決は 14 件。Sentry の「Users Impacted: 0」は利用者に影響がないことの証明ではない。検索失敗は利用者の再試行が必要になるため、手元で再現しなくても追跡を続ける。

## 判断と次の作業

| Issue | 判明したこと | 次の作業 | 判断 |
| --- | --- | --- | --- |
| [1G](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-1G) | React の DOM 削除が失敗。10/2 にも発生し、駅入力直後のイベントがある。 | 駅入力・ページ遷移で再現し、React 管理下の DOM を変更する処理と外部スクリプトを切り分ける。 | 未解決。検索画面への影響があり得る。 |
| [14](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-14) | 分割検索 API が 15 秒でタイムアウト。画面には再試行を案内するが検索は失敗する。 | 同時刻の Cloudflare/Cloud Run ログ、API 処理時間、通信中断を照合する。 | 未解決。成功する手元の再現だけでは閉じない。 |
| [10](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-10) / [1Z](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-1Z) | ticket/pass の Worker 初期化が約 30 秒でタイムアウト。 | Worker 起動、WASM/グラフ取得、初期化の各所要時間を計測する。遅い回線でも検証する。 | 未解決。能力別の記録は残すが、バージョン差で判断しない。 |
| [Z](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-Z) | Worker 初期化中の `Load failed`。`engine_initialization_failed / worker_bootstrap`。 | Worker 内の資材取得とネットワークの足あとを照合する。 | 未解決。検索失敗の可能性がある。 |
| [9](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-9) | `worker.onerror`。同じ失敗の直接送信と検索失敗通知が複数 Issue に分かれたため、4 件を統合済み。 | Worker の読み込み失敗の原因を調べ、二重送信を避ける。ただし検索失敗自体の記録は維持する。 | 未解決。マージは修正ではない。 |
| [20](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-20) | WASM 取得が 2 回再試行後、reason のない AbortError で失敗。 | Abort の発生元と再試行時の signal 伝播を確認する。 | 未解決。キャンセルの理由は未確定。 |
| [11](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-11) | WASM 取得がネットワークの `Load failed` で失敗。 | 取得 URL と再試行・キャッシュの動作を確認する。 | 未解決。 |
| [1E](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-1E) | 特定のハッシュ付き `main.wasm` が HTTP 403。 | 配信設定、当該資材の存否、旧ページからのアクセス時のキャッシュを確認する。 | 未解決。403 の原因は未確定。 |
| [16](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-16) | ticket グラフ初期化が `Load failed`。WASM 取得失敗とは段階が異なる。 | グラフ資材の URL、応答と再試行を確認する。 | 未解決。 |
| [1J](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-1J) | `/split/ticket` のインラインスクリプト位置で `Unexpected end of input`。 | HTML 配信の途中切断、スクリプト生成、外部挿入を切り分ける。 | 未解決。原因未確定。 |
| [19](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-19) | View Transition の DOM 更新がタイムアウト。 | 遷移先の描画とナビゲーション完了を検証する。 | 未解決。画面遷移への影響を否定できない。 |
| [18](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-18) / [1A](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-1A) | View Transition が中断。詳細なスタックがない。 | 遷移操作の連続実行で再現し、最終ページが表示されるか確認する。 | 未解決。一般的な中断を一律除外しない。 |
| [1T](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-1T) | 非表示の文書でブラウザが View Transition をスキップ。Astro の `startViewTransition` 由来。 | 固有のメッセージだけ Sentry 送信から除外し、発生頻度や遷移動作が変われば再評価する。 | ブラウザ仕様によるアニメーションのスキップ。 |
| [17](https://kippu-navi.sentry.io/issues/JAVASCRIPT-ASTRO-17) | Viewport サイズ変更で View Transition が中断。 | 固有のメッセージだけ Sentry 送信から除外し、画面遷移の不具合報告があれば再評価する。 | ブラウザ仕様によるアニメーションの中断。 |

## 終了条件

- アプリ・配信の失敗は、原因と修正を確認し、反映後に再発がないことを確認してから Sentry 上で解決済みにする。
- 原因が外部環境でも検索失敗が発生するなら、画面の再試行動作と発生頻度を確認し続ける。
- ブラウザ仕様によるアニメーションの中断は、遷移先 DOM に問題がないと確認できたものだけ、理由付きでアーカイブする。頻度が増えた場合は再評価する。
- この記録のイベント数・最終発生時刻は調査時点の値であり、後続イベントは Sentry を正とする。
