# きっぷナビ

JR線の運賃、最安分割きっぷを計算するWebアプリケーションです。

- 本番: https://kippu-navi.com
- ステージング: https://staging.kippu-navi.com

## 公開API

認証・APIキー不要の分割検索APIを公開しています。金額は含まず、分割境界の駅名を返します。

- [APIの使い方](https://kippu-navi.com/developers/api)・[Markdown版](https://kippu-navi.com/developers/api.md)
- [OpenAPI仕様](https://kippu-navi.com/openapi.json)・[正式駅名一覧](https://kippu-navi.com/developers/stations.json)・[AI向け案内](https://kippu-navi.com/llms.txt)

駅名は一覧の`name`と完全一致が必要です（例: `（中）大久保`、`ＪＲ総持寺`、`姉ケ崎`）。同名駅は路線で確認してください。

公開APIの案内は本番向けです。stagingでは静的資材とWorker生成のAPI応答に`X-Robots-Tag: noindex, nofollow`を付けます。robots.txtはGooglebotにnoindexを読ませるため取得を許可し、それ以外のクローラーには全パスの取得拒否を案内します。stagingのllms.txtは利用・引用を避けて本番を参照するよう案内し、API発見用のHTTP Linkヘッダーやworkers.dev・プレビューURLは無効にします。

これらは認証ではないため、指示を無視するAIやクローラーのアクセス、URL自体の発見までは阻止できません。Googleに既に登録されたURLは再クロールまで残る場合があり、急ぐ場合はSearch Consoleの削除ツールを併用してください。本番のAPI公開・検索設定には影響しません。

## 構成

| 役割 | 実装 |
| --- | --- |
| 静的ページ・SEO | Astro、`src/pages`、`src/layouts/Layout.astro` |
| 計算フォーム | React Islands、`src/app/fare`、`src/app/split` |
| 計算エンジン | Go / WASM、共有Web Worker |
| 分割経路探索API | Go、Cloud Run（本番・ステージング別サービス）、Cloudflare Edge Cache |
| 静的配信 | Cloudflare Workers Static Assets |
| API・計測プロキシ | `workers/frontend.mjs` の `/api/*`、`/ingest/*`、`/monitoring` |
| フォント | Noto Sans JPをCloudflare Fontsで配信 |

全ページにClientRouterを配置し、内部リンクをhover時にプリフェッチします。Footerの細かいリンクはプリフェッチ対象外です。記事ページにはReactのクライアントランタイムを配信しません。

運賃計算と分割計算は別々のIslandを`transition:persist`で保持します。URLが変わればフォームを復元し直し、計算モードを切り替えます。同じURLのフォーム状態は保持します。WorkerはIslandの外で一つだけ共有し、フォームが終了しても再初期化しません。応答をリクエストIDで振り分け、終了済み画面や古い計算の結果を破棄します。

## ローカル開発

Node.js 24以上、および`calculation-engine/go.mod`に指定されたGoが必要です。

初回はGoの依存取得にTakumiGuardを設定します（認証不要のブロック機能を使用）。この設定は端末のGo設定に永続保存され、ほかのGoプロジェクトにも適用されます。

```sh
go env -w GOPROXY=https://golang.flatt.tech
go env GOPROXY
```

`https://golang.flatt.tech` と表示されることを確認してください。シェルで`GOPROXY`を設定している場合はそちらが優先されるため、同じURLに揃えてください。保護を迂回しないように、`,direct`や`|direct`などのフォールバックは追加しません。`go get`、`go mod download`、ビルド時の依存取得に適用されます。取得済みのモジュールキャッシュは再検査されません。

npmはリポジトリの`.npmrc`、GoのCI・デプロイは公式Action、APIのDockerビルドはビルドステージの`GOPROXY`で設定しています。詳細は[TakumiGuardのGo向け公式手順](https://shisho.dev/docs/t/guard/quickstart/golang/)を参照してください。

クラウド認証情報、`.env`、サーバー用の`pass.bin`・`ticket.bin`は不要です。以下の手順だけで乗車券・定期券・IC定期券を利用できます。

```sh
npm ci
npm run dev:api
```

別のターミナルで:

```sh
npm run dev
```

`npm run dev`は起動前にブラウザ用WASM・2種類のグラフBIN・同じGoに付属する`wasm_exec.js`を生成し、http://localhost:3000 を起動します。`/split/auto/ticket`で分割計算できます。これらのブラウザ用資材は、任意で生成するサーバー用の事前計算BINとは別物です。`/api/*`はViteからlocalhost:8080へ転送するため、ブラウザ側のCORS設定は不要です。転送先を変える場合は、開発サーバーの環境変数`DEV_API_ORIGIN`を指定します。

Goの計算ロジックやグラフを修正した場合は、`npm run dev:engine`で再生成し、ブラウザを再読み込みします。

APIは事前計算データがなければリクエスト時に都度計算します。データを読み込めないという起動時のログだけでは、起動失敗を意味しません。都度計算は経路によって処理時間が増えるため、高速化が必要になった場合に以下の事前計算を行ってください。

### 探索を高速化する任意の準備

事前計算ファイルはサーバー専用です。GitHub Actionsでは生成元ソースのハッシュをキーにキャッシュし、キャッシュがない場合はrunner上で生成します。

ローカルでは以下のコマンドで生成できます。特に定期券用は計算量が大きいため、初回起動には必要ありません。

```sh
npm run generate:pass-fares
```

```sh
npm run generate:ticket-fares
```

定期券用・乗車券用の事前計算ファイルは、`calculation-engine/data/precomputed/pass.bin` と `calculation-engine/data/precomputed/ticket.bin` に配置します。これらの大きなファイルはサーバー専用で、ブラウザへ配信しません。APIは `PRECOMPUTED_DATA_DIR` で配置ディレクトリを変更できます。 定期券（磁気・IC）・乗車券とも、事前計算ファイルがない場合や読み込み失敗・駅数不一致の場合でもAPIは起動し、リクエスト時に都度計算します。有効な事前計算データがある場合は引き続き優先して使用します。

## ビルド・検証

```sh
npm run typecheck
npm run lint
npm run knip
npx playwright install chromium
npm run test:e2e
npm run test:dev
npm start
```

`npm run test:e2e`（または`npx playwright test`）は、テストサーバー起動前に`npm run build`を実行し、ハッシュ付きエンジン資材とPWA保存一覧を生成します。ポート4321を使用中のプレビューサーバーは停止してから実行してください。

ブラウザ回帰テストは公開グラフから生成した本物のWASMを使い、APIの探索結果を固定します。非公開データや稼働中のAPIは不要です。インストール済みChromeを使う場合は`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`を実行できます。

`npm run test:dev`は開発サーバー（3018番）と実API（18080番）を起動し、空の一時ディレクトリを事前計算データの参照先に指定します。乗車券、定期券・IC定期券の1・3・6箇月、経路指定のWASM計算を検証し、終了時にサーバーと一時ディレクトリを片付けます。既存BINやクラウド認証は使いません。インストール済みChromeを使う場合は`PLAYWRIGHT_CHANNEL=chrome npm run test:dev`を実行してください。WASM資材の生成が競合しないよう、`test:e2e`と`test:dev`は順番に実行します。

`npm run build`はWASM生成、Astroビルド、Cloudflare用の梱包まで行い、`dist`を作ります。通常はステージング向け（noindex）です。本番向けは`DEPLOY_ENVIRONMENT=production npm run build`で生成します。

`npm start`は静的成果物のローカルプレビューです。APIプロキシは提供しないので、実APIと一緒に動かす開発には`npm run dev`を使ってください。

## 環境変数とキャッシュ

| 変数 | 用途 |
| --- | --- |
| `PUBLIC_GOOGLE_ANALYTICS_ID` | GA4測定ID。ページビューの集計だけに使用 |
| `PUBLIC_POSTHOG_KEY` | PostHogキー。匿名のページ・検索集計だけに使用 |
| `PUBLIC_SENTRY_DSN` | Sentry DSN。ブラウザのシステム例外だけに使用 |
| `PUBLIC_WASM_VERSION` | ビルドスクリプトが自動生成する内容ハッシュ。手動指定不要 |
| `DEPLOY_ENVIRONMENT` | `staging`または`production` |
| `API_ORIGIN` | Cloudflare Workerの転送先兼Cloud Run IDトークンのaudience。環境別の`run.app`サービスURL |
| `GCP_SERVICE_ACCOUNT_EMAIL` | Worker secret。環境別Cloud Run Invokerサービスアカウント |
| `GCP_SERVICE_ACCOUNT_PRIVATE_KEY` | Worker secret。InvokerサービスアカウントのPKCS#8秘密鍵 |
| `SENTRY_DSN` | Worker secret。`/monitoring`の固定転送先検証に使用 |
| `SENTRY_ORG` / `SENTRY_PROJECT` | Sentryのソースマップアップロード先 |
| `SENTRY_AUTH_TOKEN` | CI secret。ソースマップアップロードだけに使用 |

`.env.local`とGitHub Repository Variablesには`PUBLIC_GOOGLE_ANALYTICS_ID`、`PUBLIC_POSTHOG_KEY`、`PUBLIC_SENTRY_DSN`、`SENTRY_ORG`、`SENTRY_PROJECT`を設定します。`SENTRY_AUTH_TOKEN`はGitHub Environment Secretに設定し、公開しません。Cloudflareには環境ごとに`SENTRY_DSN`、`GCP_SERVICE_ACCOUNT_EMAIL`、`GCP_SERVICE_ACCOUNT_PRIVATE_KEY`をsecretとして登録します。Googleの秘密鍵はリポジトリ、GitHub Secrets、Wrangler vars、ログには保存しません。Sentryの従量課金は有効化せず、Developerプランの上限を使用量通知で監視します。

## 監視と調査

| 基盤 | 責務 | 送信しない情報 |
| --- | --- | --- |
| Google Analytics 4 | hostname、絶対URL、ページタイトルを使ったページビュー集計 | 検索条件、計算結果、エラー情報 |
| PostHog | パス別ページビュー、検索条件（駅名・経路・検索URL）、検索種別・成否・時間区分、運賃・節約額の匿名集計 | エラー本文、一意の検索ID、個人プロファイル、セッション記録 |
| Sentry | ブラウザ、React、Web Worker、WASMのシステム例外 | Cookie、認証ヘッダー、ユーザー識別、成功検索 |
| Cloudflare Workers Logs | Edgeプロキシのstatus、遅延、キャッシュ、転送失敗 | 駅名や経路を独立フィールドまたはメッセージに複製しない |
| Google Cloud Logging | Cloud Run APIのstatus、遅延、panic、起動失敗 | 駅名や計算経路をログ本文に出さない |

PostHogの検索イベントには、クエリパラメーターを含むクリック可能な検索URLと構造化した検索条件・計算結果を保存します。検索間の関連付けはブラウザのセッション内だけで行い、個人を識別しません。API障害はSentryの`request_id`を起点にCloudflare、Google Cloud Loggingの順で追跡します。Web WorkerまたはWASMだけの障害は、Sentryの`error_code`、`error_stage`、`engine_version`、障害時URLで再現します。PostHogは障害調査やアラートには使用しません。新規・再発例外はSentry、Edgeの5xx・転送失敗はCloudflare、APIの5xx・panicはGoogle Cloud側で通知を設定します。Sentryの障害イベントはDeveloperプランの30日参照を前提とします。

GA4はページビューだけを収集します。Google tag gateway for advertisersをCloudflareで有効にし、タグ配信と計測リクエストを同一オリジンの未使用パス経由にします。独自WorkerにはGA4の転送処理を追加しません。

WASM・Goランタイム・2種類のBINの内容からSHA-256を計算し、`/engine/<hash>/`へまとめて配置します。UIだけの変更ではエンジンURLは変わりません。エンジンは1年間のimmutableキャッシュ、HTMLはStatic Assetsの更新管理を使います。分割経路探索のGET APIは成功レスポンスだけをCloudflareで30日間共有し、ブラウザには保存しません。`deployment.json`で環境・コミット・エンジンバージョンを確認できます。

## デプロイ

本番・ステージングのデプロイ、Cloud Run認証、鍵ローテーションは[運用手順](docs/deployment.md)を参照してください。

Noto Sans JPはGoogle FontsのCSS2 APIが返す`unicode-range`別の可変フォントを使用します。Cloudflareダッシュボードの「Speed > Settings > Content Optimization」でCloudflare Fontsを有効にすると、Google FontsへのリンクがインラインCSSへ変換され、必要なサブセットだけが同一オリジンの`/cf-fonts/`から配信されます。Google Fontsへの`preconnect`はローカル開発や変換対象外時のフォールバック用で、変換時にはCloudflareが削除します。

## 著作権

Copyright © 2025-2026 きっぷナビ. All Rights Reserved.
