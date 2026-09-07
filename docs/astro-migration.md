# Astro移行の運用メモ

## ローカル実装

- 全19ページと404をAstroへ移行。既存の拡張子なしURL、title、description、JSON-LD、sitemap.xmlを維持。
- canonicalとOGP URLは本番ホストの拡張子なしURLを指す。faviconは現在のホストから取得。
- 共通ClientRouterを使用。リンクはhoverでプリフェッチし、Footerでは無効化。
- 計算画面は運賃・分割の2種類のReact Island。種類・期間・経路はURLに従う。
- Workerは1タブに一つ。同じURLではフォーム状態を維持し、URLが変わった場合はフォームのみ復元。結果・エラーのIDを画面ごとに振り分ける。
- PostHogは`astro:page-load`でページビューを記録。計算イベントは各フォームで継続。`/ingest/static/*`と`/ingest/array/*`はアセットホストへ、それ以外はイベントホストへ転送。
- Noto Sans JPとGeist MonoはFontsourceの依存パッケージからビルドへ同梱。ブラウザはGoogle Fontsへ接続しない。
- `npm run build`でエンジン生成から`dist`への梱包まで実行。UI変更だけでWASMの内容ハッシュは変わらない。

## ローカルでの回帰確認

`npm run typecheck`、`npm run lint`、`npm run knip`、`npm test`、`npm run build`、`npm run test:e2e`を実行する。

ブラウザテストはビルド済み成果物と本物のWASMを使い、外部計測送信を遮断し、APIの探索結果を固定する。URL直接入力、再読み込み、同一画面の異なるクエリ、5画面間の遷移、戻る・進む、Workerの共有、初期化待ち・失敗、モバイルメニュー、プリフェッチ、全既存URLとSEO情報を対象にする。

実APIとの接続確認は`npm run dev:api`と`npm run dev`を使う。`npm start`の静的プレビューにはAPIプロキシがない。

## ステージングへ反映する前

1. 旧フロントエンドのCloudflare Buildsは無効化した状態を維持する。
2. Google Cloudの旧フロントエンドCloud Buildトリガーが残っていれば無効化する。Go APIのトリガーは別管理。
3. GitHubのstaging Environmentに既存のCloudflare Secretsを維持する。計測IDは従来の`NEXT_PUBLIC_*` Variablesでも使用可能。Firebase変数は不要。
4. `CLOUDFLARE_PRODUCTION_ENABLED`は有効化しない。
5. pushが明示的に許可された段階で開発ブランチへpushする。main以外のブランチは同じステージングへ配信される。
6. `stg.kippu-navi.com/deployment.json`の環境・コミット・enginePathを確認する。
7. 実Cloud Run APIによる計算、PostHogのページビューと計算イベント、ブラウザ履歴、モバイル表示を確認する。
8. Cache Everythingなどの既存Cache RulesがステージングのHTMLを上書きキャッシュしていないことを確認する。Static Assetsの更新管理とは別のルールに注意する。

この実装作業ではpush・ステージング配信・本番切り替えを行わない。R2バケットや稼働中のCloud Runサービスも変更しない。

## 本番切り替え

ステージング確認後に別途実施する。production WorkerのAPI_ORIGIN、ドメインの割り当て、旧Cloud Runへ向くDNS・ルート、Cache Rules、Google Search ConsoleでのURLを確認する。実装済みの本番自動デプロイ抑止を解除するのは、切り替えを明示的に承認したときだけとする。
