# エンジン資材の通信失敗と回復の照合

## 回復の確認

Sentryの`failure_id`を、PostHogの`search_completed.recovery_failure_id`と照合する。

- `outcome=success`は、その障害を経てWorkerが準備でき、検索結果まで得られた記録。
- 再起動後も準備に失敗した場合は、PostHogとSentryの`recovery_failure_id`が直前の障害を指す。再失敗自身には新しい`failure_id`が付く。
- 同じWorkerを使う後続検索にも同じ回復元IDが付くため、成功イベント数を回復した障害数として数えない。
- `engine_recovered=true`だけでは元の障害を特定できない。以前のイベントへ障害IDを遡って補完することもできない。
- リロードを伴う回復には既存の`reload_failure_id`を使う。ページ離脱・計測遮断・ボット除外などで後続イベントがない場合は、回復失敗と断定しない。

## 配信ログとの照合

Sentryの`engine_diagnostics.resources`内の失敗レコードで、資材URL、発生時刻、受信バイト数、`timedOut`と`response`を確認する。

`response`には取得できたHTTPステータス、Cloudflare Ray ID（`cfRay`）、キャッシュ結果（`cacheStatus`）、Content-Length（`contentLength`）が入る。ヘッダー取得前に失敗した場合は存在しない。

Ray IDを、利用可能なCloudflareのリクエストログと照合する。ログの保持期間・対象・アクセス権限によって照合できない場合がある。キャッシュやService Workerが応答を再利用した場合、保存されたRay IDは今回の通信を表すとは限らないため、URLと時刻も確認する。

HTTP 200はヘッダー取得を示すだけで、本文の完了を保証しない。圧縮時はContent-Lengthとブラウザが展開した受信バイト数を単純比較しない。`timedOut=false`の途中受信失敗でも、端末の回線・ブラウザ・配信側のどこが原因かはこの記録だけでは断定しない。

## 表示モードと端末内配信の区別

SentryのタグとPostHogイベントに`display_mode`と`service_worker_controlled`を記録する。表示モードは`standalone`、`minimal-ui`、`fullscreen`、`window-controls-overlay`、`browser`、`unknown`で、インストール済みかどうかの判定ではない。ブラウザの全画面表示もあるため、`fullscreen`だけでPWAと断定しない。

Service Workerに制御されるブラウザタブもあり得るため、表示モードと制御有無を別々に比較する。資材の失敗レコードの`response.serviceWorkerSource`で、実際に応答したService Workerの経路を確認する。

- `service-worker-cache`: 保存済み資材から返した応答。
- `service-worker-network`: Service Workerがネットワークから取得・検証して返した応答。
- `service-worker-unavailable`: Service Workerで資材を取得できず返した503。
- `version-mismatch`: そのService Workerにない版のエンジン資材への404。

印がない応答は、Service Worker未制御とは限らない。旧Service Workerなど診断非対応の応答もあるため配信元不明として扱う。`response.contentEncoding`も確認し、圧縮されたContent-Lengthと展開後の受信量を単純比較しない。`lastReceivedAgoMs`は例外通知時点から最後に本文を受信した時点までの経過時間で、未受信の場合は記録しない。
