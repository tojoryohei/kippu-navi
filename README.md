# きっぷナビ

JR線の運賃、定期券運賃、最安分割きっぷを計算するWebアプリケーションです。

- 本番: https://kippu-navi.com
- ステージング: https://stg.kippu-navi.com

## 構成

| 役割 | 実装 |
| --- | --- |
| 静的ページ・SEO | Astro、`src/pages`、`src/layouts/Layout.astro` |
| 計算フォーム | React Islands、`src/app/fare`、`src/app/split` |
| 計算エンジン | Go / WASM、共有Web Worker |
| 分割経路探索API | Go、Cloud Run（本番・ステージング別サービス） |
| 静的配信 | Cloudflare Workers Static Assets |
| API・PostHogプロキシ | `workers/frontend.mjs` の `/api/*` と `/ingest/*` |
| フォント | FontsourceのNoto Sans JP・Geist Monoをビルド成果物へ同梱 |

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

分割APIの事前計算ファイルはサーバー専用です。ローカルにない場合、乗車券は次のコマンドで生成できます。

```sh
npm run generate:ticket-fares
```

定期券用の`calculation-engine/internal/pass/graph/data/precomputed_server.bin`は従来どおり別途配置してください。これらの大きなファイルはブラウザへ配信しません。

## ビルド・検証

```sh
npm run typecheck
npm run lint
npm run knip
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm start
```

既存のVitestテストには非公開の`src/data`が必要です。ブラウザ回帰テストは公開グラフから生成した本物のWASMを使い、APIの探索結果を固定するため、非公開データや稼働中のAPIは不要です。インストール済みChromeを使う場合は`PLAYWRIGHT_CHANNEL=chrome npm run test:e2e`を実行できます。

`npm run build`はWASM生成、Astroビルド、Cloudflare用の梱包まで行い、`dist`を作ります。通常はステージング向け（noindex）です。本番向けは`DEPLOY_ENVIRONMENT=production npm run build`で生成します。

`npm start`は静的成果物のローカルプレビューです。APIプロキシは提供しないので、実APIと一緒に動かす開発には`npm run dev`を使ってください。

## 環境変数とキャッシュ

| 変数 | 用途 |
| --- | --- |
| `PUBLIC_POSTHOG_KEY` | PostHogキー。ホストは同一オリジンの`/ingest`固定 |
| `PUBLIC_GOOGLE_ANALYTICS_ID` | Google Analytics測定ID |
| `PUBLIC_WASM_VERSION` | ビルドスクリプトが自動生成する内容ハッシュ。手動指定不要 |
| `DEPLOY_ENVIRONMENT` | `staging`または`production` |
| `API_ORIGIN` | Cloudflare Workerの転送先。`wrangler.jsonc`で環境別に指定 |

既存の`.env.local`とGitHub Variablesの`NEXT_PUBLIC_POSTHOG_KEY`、`NEXT_PUBLIC_GOOGLE_ANALYTICS_ID`も移行中は使用できます。Firebaseの変数は不要です。

WASM・Goランタイム・2種類のBINの内容からSHA-256を計算し、`/engine/<hash>/`へまとめて配置します。UIだけの変更ではエンジンURLは変わりません。エンジンは1年間のimmutableキャッシュ、HTMLはStatic Assetsの更新管理を使います。`deployment.json`で環境・コミット・エンジンバージョンを確認できます。

## デプロイ

GitHub Actionsの`deploy-frontend.yml`がフロントエンドを配信します。main以外はステージング、mainは本番に対応します。ただし本番は`CLOUDFLARE_PRODUCTION_ENABLED=true`にするまで自動デプロイされません。

Astro移行後のフロントエンドでは、Next.js用のDockerfile・Cloud Build設定・Pages Functionsは使用しません。既存の本番Cloud Runサービスをこの変更が削除・更新することはありません。切り替え前にGoogle Cloud側の旧フロントエンドCloud Buildトリガーを無効化してください。Go APIのCloud Runデプロイは`deploy-api.yml`で継続します。

本番切り替え前の確認事項は[移行メモ](docs/astro-migration.md)を参照してください。

## 著作権

Copyright © 2025-2026 きっぷナビ. All Rights Reserved.
