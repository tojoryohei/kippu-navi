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
