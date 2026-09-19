# きっぷナビ

JR線の運賃、定期券運賃、最安分割きっぷを計算するWebアプリケーションです。

- 本番: https://kippu-navi.com
- ステージング: https://staging.kippu-navi.com

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

```sh
npm ci
npm run dev:api
```

別のターミナルで:

```sh
npm run dev
```

`npm run dev`は起動前にWASMと2種類のグラフBINを生成し、http://localhost:3000 を起動します。`/split/ticket`で分割計算できます。`/api/*`はViteからlocalhost:8080へ転送するため、ブラウザ側のCORS設定は不要です。

Goの計算ロジックやグラフを修正した場合は、`npm run dev:engine`で再生成し、ブラウザを再読み込みします。

分割APIの事前計算ファイルはサーバー専用です。GitHub ActionsではGCSから取得し、GCSオブジェクトのMD5と生成元ソースのフィンガープリントを検証します。不足・不一致時はrunner上で生成し、生成・再生成したデータを共有GCSへ保存するのはmainの本番デプロイだけです。

ローカルにない場合、事前計算ファイルは次のコマンドで生成できます。定期券用は計算量が大きいため、必要な場合だけ実行してください。

```sh
npm run generate:pass-fares
```

```sh
npm run generate:ticket-fares
```

定期券用・乗車券用の事前計算ファイルは、`calculation-engine/data/precomputed/pass.bin` と `calculation-engine/data/precomputed/ticket.bin` に配置します。これらの大きなファイルはサーバー専用で、ブラウザへ配信しません。APIは `PRECOMPUTED_DATA_DIR` で配置ディレクトリを変更できます。

## ビルド・検証

```sh
npm run typecheck
npm run lint
npm run knip
npm run build
npx playwright install chromium
npm run test:e2e
npm start
```

ブラウザ回帰テストは公開グラフから生成した本物のWASMを使い、APIの探索結果を固定します。非公開データや稼働中のAPIは不要です。インストール済みChromeを使う場合は`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`を実行できます。

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
