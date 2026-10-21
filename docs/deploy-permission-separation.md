# ビルドと公開の権限分離

## 信頼境界

`target_sha`はビルド対象、`control_sha`は公開処理の定義元です。通常はmainから起動したワークフローの`github.workflow_sha`をcontrol_shaに固定します。対象ブランチのソースはビルドジョブだけで実行します。公開ジョブはcontrol_shaを`control/`へcheckoutし、成果物内の設定・スクリプト・package.jsonを実行しません。

ビルドは「外部サービスの資格情報を持たない」ジョブです。GitHubのcheckout、キャッシュ、artifact操作用トークンはあります。Sentry・Cloudflare・GCPの資格情報、OIDC発行権限、シークレット保管用Environmentはありません。checkoutの資格情報永続化は無効です。

認証を伴うジョブだけに既存のstaging／production Environmentを付けます。承認・ブランチ保護設定は変更しません。公開ツールはcontrol_shaの`tools.json`で固定し、資格情報を渡す前に、対象リポジトリから独立した一時ディレクトリへ導入します。npmのインストールスクリプトを無効にします。Cloud SDKも固定版を認証前に準備します。

## 公開設定値

ビルド用の値はRepository Variablesから取得します。`STAGING_`／`PRODUCTION_`を付けた変数を優先し、未定義なら既存の共通名を使用します。

- `PUBLIC_GOOGLE_ANALYTICS_ID`
- `PUBLIC_POSTHOG_KEY`
- `PUBLIC_SENTRY_DSN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

これらは公開設定です。トークンを変数やresolve出力に置いてはいけません。Environment VariablesやEnvironment Secretsからビルドへコピーしません。

Cloudflareの配信先・bindingsはcontrol_shaの`wrangler-settings.json`から許可項目のみで構築します。公開設定にはカスタムビルド、自動設定探索、追加モジュール探索を持たせません。完成済みWorkerと静的ファイルを`--no-bundle`で公開します。元のwrangler設定との基礎値の一致は自動テストで確認します。

## 成果物

フロントエンド公開用、Sentry送信用、APIイメージを別artifactに保存します。名前は種別・環境・対象SHA・run ID・生成時attemptを含み、保持期間は1日です。ダウンロードは生成ジョブが出力したartifact IDを指定します。

期待するSHA・環境はresolve、artifact ID・アーカイブのSHA-256・生成attemptは生成ジョブの出力から取得します。manifestはこれらと照合します。GitHubのダイジェスト警告に依存せず、SHA-256不一致は失敗させます。絶対パス、親参照、リンク、特殊ファイル、重複パス、実行権限、用途外パスを展開前に拒否します。Dockerイメージは通常ファイルのimage.tarとして扱い、コンテナ内部の実行ファイルを静的資材とは区別します。

ハッシュは整合性確認であり、ビルド内容が安全であることの証明ではありません。

## Sentry

ビルドではCI専用フラグでhidden mapを生成し、固定版CLIでDebug IDを注入します。注入後にPWAのハッシュとService Workerを生成します。送信用と公開用のJSが一致することを検証し、mapは公開成果物から除きます。ブラウザイベントと送信時のreleaseは既存どおり`バージョン+target_sha`です。

送信ジョブは同じreleaseの作成・送信・確定を再実行できます。Sentryの失敗を無視して公開しません。

トークンは発行方式と実際の操作で選びます。組織トークンはCI用の`org:ci`、個人トークンはCLIリリース管理用の`project:releases`と`org:read`が候補です。発行元の画面で権限とプロジェクトアクセスの制限方式を確認してください。トークンの接頭辞だけでは権限の証明になりません。

2026-10-21にSentry管理画面で既存の組織トークン`github-actions`のスコープが`org:ci`であることを確認しました。既存トークンのスコープは変更不可で、編集画面にはプロジェクト単位の制限項目がありません。この方式は組織単位のCI権限であり、プロジェクト単位に限定した権限とは表現しません。CIでもトークン方式と送信成功を確認し、既存トークンがこの最小構成なら不必要な再発行はしません。

交換が必要な場合、旧トークンはステージング成功だけで失効させず、既存の本番利用先すべてを新トークンへ移行し、正常動作を確認してから失効します。

## ステージング検証と再実行

候補ブランチ`ci/deploy-permission-separation`では、検証中だけ手動入口と再利用ワークフローのresolveに「このブランチかつ手動起動かつstaging」の許可を追加します。control_shaは起動時のgithub.workflow_shaです。production経路はmain限定を維持します。検証後、その許可を除いた差分をmain反映用とします。main反映後もmainの制御コードからステージングを再検証します。

1. 候補ブランチの手動ステージングワークフローで対象ブランチを指定します。
2. フロントエンドのビルド、Sentry送信、Cloudflare公開、続いてAPIのビルド・登録・公開を確認します。共有stagingの排他制御と既存の公開順序を維持します。
3. `deployment.json`のSHA・環境、WASM配信、画面からの計算、API応答の識別情報、Cloud Runの実行SA・Invoker IAM・allUsers非許可を確認します。
4. Sentry検証イベントのDebug ID、ソース位置復元、releaseとtarget_shaの一致を確認します。
5. ジョブ権限とシークレット参照を検査し、不要なステップへの供給がないことを確認します。

ジョブだけを再実行するときは、元の生成ジョブのartifact IDと生成attemptを使用します。現在のrun attemptで別artifactを検索しません。ビルドから再実行した場合は、新しいIDから後続も再実行します。

- Sentry成功後のCloudflare失敗: 成果物が有効な間は公開ジョブを再実行できます。Sentryを再実行しても同じreleaseへ送信します。
- API登録後の公開失敗: 登録済みdigestから公開を再実行します。タグから再解決せず、公開ジョブのneeds出力のdigestを使います。
- フロントエンド成功後のAPI失敗: フロントエンドだけ更新済み、APIは旧版の状態があり得ます。自動ロールバックは行いません。失敗した後続を再実行してください。
- 保持1日を過ぎてartifactが失効した場合: 新しいrunで再ビルドします。古いIDを別のartifactに置き換えません。

本番APIは同じ対象SHAのフロントエンド成功を、外部資格情報を持たない待機ジョブで確認してからCloud Runへ公開します。

## 今回の検証記録

- 候補control_sha／target_sha: `aa7cb7dd82f6dac0869bca0fa08f8e2bf3c1e688`。
- [ステージング実行](https://github.com/tojoryohei/kippu-navi/actions/runs/39545361188)。フロントエンドのビルド、Sentry送信、Cloudflare公開が成功。ビルドの実ログのGitHub権限はContents／Metadataのreadのみで、OIDC発行権限なし。
- 公開用artifact ID: `12321541696`、Sentry用artifact ID: `12321516783`。公開ジョブではそれぞれのIDと独立した期待ハッシュで検証・展開。
- ステージングのdeployment.jsonのSHA一致、ハッシュ付きWASMのHTTP 200・magicを確認。
- [Sentry検証イベント](https://kippu-navi.sentry.io/issues/7803782724/events/4a617057446e4294ae1189f228339b87/): `component=deployment-verification`、`environment=staging`、`release=5.2.0+aa7cb7dd82f6dac0869bca0fa08f8e2bf3c1e688`。Sentry管理画面で`src/lib/analytics.ts:189:5`の元コードへ復元されたことを確認。
- ローカル: actionlint＋ShellCheck、型検査、Knip、既存Worker／automation 64件、新規automation 6件、成果物検証8件、PWA／更新／計算画面のブラウザ33件が成功。
- APIのビルド・登録・digest指定公開・IAM検証が成功。APIビルドの実ログもContents／Metadataのreadのみ。API用artifact IDは`12322805203`。
- 初回公開のCloud Run Ready Revisionは`calculation-engine-staging-00087-hq5`。イメージdigestは`sha256:acf3a1b69e7ca395ef98fe3b2e9165e8c91b215061bbe5b2f48c95dd3ac74b7d`。
- ステージングの画面で新茂原→茂原の計算結果を確認。実APIはHTTP 200、`X-Deployment-Commit=aa7cb7dd82f6dac0869bca0fa08f8e2bf3c1e688`、`X-Request-ID=f40066a7-c0d5-444c-a297-af621b58a7c4`。
- Cloud Runの実行SAは`calculation-engine-stg-runtime`。Invoker IAMの無効化なし、`roles/run.invoker`の許可先は`cloudflare-api-invoker-stg`のみで`allUsers`なし。
- 同じrunのattempt 2でSentry送信から再実行。生成attempt 1のSentry artifact ID `12321516783`をそのまま指定し、`EXPECTED_ATTEMPT=1`で検証・既存releaseの再確定に成功。
- attempt 2の後続も全ジョブ成功。フロントエンド公開は元のartifact ID `12321541696`／生成attempt 1、API登録は再ビルドのartifact ID `12322253286`／生成attempt 2を使用したことを実ログで確認。
- 再実行後のReady Revisionは`calculation-engine-staging-00088-grc`、digestは`sha256:d1399df31bfa618a648cf5390d0d9d7f69faabb41d007ab9ee2479b167d72a24`。画面の計算結果、実APIのHTTP 200と対象SHA一致を再確認（request ID: `f64c51e1-833f-4547-b3b1-c5155b5c027b`）。
- 最終差分から候補ブランチ専用の一時許可を除去。main限定のresolveを確認する回帰テストを追加し、ローカルで成功。
- main反映と、反映後のmain制御コードからの再検証は未実施。この作業ではmain／本番へ反映しない。


## PR作成前のテスト見直し

- YAMLの字面・ジョブ名・一時ブランチ名を固定する5件を削除。構文はactionlint／ShellCheck、実公開と再実行は上記のステージング検証で確認する。
- ビルド用と公開用で二重管理しているWrangler設定の不一致を検出する1件は、既存のstagingテストへ集約。設定ファイルに特定の文字列がないだけの検査は削除した。
- 資格情報を持つ公開ジョブが扱う成果物の拒否条件を確認する7件を維持。ビルド側のリンク拒否だけを確認する重複テストを削除し、公開不可ファイルのテストは許可関数の直接照合から、manifest・ハッシュを整合させたアーカイブの検証へ置き換えた。
- 上記の検証記録の件数は見直し前の履歴。見直し後のローカル検証はWorker／automation 65件、成果物検証7件。
- 公開不可ファイルの拒否処理を一時的に無効化したモジュールに対してアーカイブ検証テストが失敗することを確認し、拒否処理の回帰を検出できる根拠とした。製品コードは変更していない。


## 統括・検証の追加

公開入口と再実行規則は[デプロイ後検証手順](deployment-verification.md)へ更新しました。本番APIが別workflowのフロントエンドrunを待つ方式は廃止し、環境ごとの統括ワークフローで公開順序を管理します。ビルド/公開の資格情報分離とartifact検証は維持します。

開始確認をrun attemptに結び付けるため、旧手順の「公開ジョブだけ再実行」は拒否されます。全ジョブの再実行・対象SHAの再確認を行ってください。APIのInvokerには環境別の検証専用SAも含まれます。過去の検証記録は当時の構成の記録です。
