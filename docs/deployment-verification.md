# Cloud Run直接検証と復旧

## 現在の検証範囲

| 更新対象 | 必須条件 | 公開後の確認範囲 |
| --- | --- | --- |
| 両サービス | 両公開・IAM・Revision照合・直接検証の成功 | 新APIの固定3ケース |
| フロントエンドのみ | フロントエンド公開の成功 | 動作確認なし。直接検証は対象外 |
| APIのみ | API公開・IAM・Revision照合・直接検証の成功 | 新APIの固定3ケース。既存フロントエンドSHAは対象外 |

専用SAでCloud Runのrun.appへ直接アクセスし、配信Revision・image digest・比較用メタデータSHA・バイナリ内SHAと検索JSONを確認する。フロントエンドのSHAは公開に使用したartifactの検証結果であり、公開先から読み返した値ではない。更新しないフロントエンドSHAはnullと対象外理由を記録する。事前判定では期待artifact SHA、最終集計では公開成功時だけartifact SHAを記録する。

公開サイトへのHTTP・ブラウザー検証はデプロイ処理から完全に外す。公開API、CloudflareからAPIへの接続、公開WASM、画面上の計算結果、全経路の計算正確性・キャッシュ更新は保証対象外。`/deployment.json`の生成・配信は維持するが、APIのみの更新を含め、デプロイ処理から取得しない。固定IPランナーやCloudflare保護設定の変更は行わない。既存のビルド・通常のローカルE2Eは維持する。

## 公開制御とAPI更新判定

本番は`deploy-production.yml`、ステージングは`deploy-staging.yml`を入口にする。ステージングはmain以外へのpush、main向けの同一リポジトリPRの作成・再オープンで`Staging request`を起動し、mainの制御コードから要求時の先端SHAを自動公開する。通常ブランチとRenovateブランチの両方が対象で、PRの存在やCI成功は公開条件にしない。外部fork・削除済みブランチ・古いSHAは対象外。mainから非mainブランチを指定する手動起動も維持する。両入口は`deploy-release.yml`へ統合し、通常公開・復旧・自動stagingとも環境別の`deployment-production`／`deployment-staging`で排他制御する。自動stagingでは排他取得後にもブランチ先端SHAを照合し、両サービスを更新する。子ワークフローは再利用専用。資格情報なしのビルド、control_sha固定の制御コード、artifact ID・ハッシュ照合を維持する。

成果物は`upload-artifact`／`download-artifact`でディレクトリとして受け渡し、独自のtar圧縮・解析は行わない。`scripts/deploy/artifact.mjs`はNode.js標準機能だけでmanifestを生成・検証する。ビルドジョブの出力に固定したmanifestのSHA-256と、対象SHA・control SHA・環境・生成run/attempt・releaseを照合し、全ファイルの一覧・SHA-256・許可パス・必須ファイル・容量上限を確認する。リンク・特殊ファイルを拒否し、全検証後に新規の公開用ディレクトリへ通常ファイルだけを配置する。公開資格情報は検証後のステップだけに渡す。フロントエンドは検証済みの`static/.well-known`も転送するため`include-hidden-files: true`を指定する。Dockerイメージの`image.tar`は`docker save`／`docker load`用に維持する。

通常本番は排他取得後の公開開始時に対象SHAとmain先頭の一致を確認し、その実行中は固定する。途中でmainが進んでも継続し、古い対象をmainへ読み替えない。開始確認はrun ID・attempt・SHA・環境に結び付ける。失敗ジョブだけの再実行は古いattemptの確認を拒否するため、統括から全ジョブを再実行する。対象が古い通常公開は最新mainの新規実行を使う。

Cloud Runの実配信状態がReady・観測済みで、正の割合のRevisionが1つ、合計100%の場合だけ実行時DEPLOY_COMMITを比較元にする。latestCreated/latestReadyや0%タグは基準にしない。分割配信・未確定・SHA不明・履歴不足・差分失敗ではAPI更新を省略しない。frontendを明示してもAPI変更・基準不明ならallでの再実行を求める。

比較は基準SHAと対象SHAのツリー間。`calculation-engine/**`、`.github/workflows/**`、`scripts/**`と`.dockerignore`、`.node-version`、`.npmrc`、`package.json`、`package-lock.json`、`wrangler.jsonc`、`astro.config.mjs`、`tsconfig.json`をAPI更新対象とする。

DEPLOY_COMMITは次回判定用、バイナリ内SHAのX-Deployment-Commitは直接検証用の証拠。API公開後、新Revisionへの100%配信・Ready・メタデータSHA・digestを照合し、直接応答のSHAも照合する。本番キャッシュとstagingのno-storeを維持する。

## 認証と直接検証

既存WIF・Environment保護を維持し、環境別の専用SAを使用する。

- staging: `github-smoke-staging@bubbly-trail-470023-e4.iam.gserviceaccount.com`
- production: `github-smoke-production@bubbly-trail-470023-e4.iam.gserviceaccount.com`

各SAは対応Cloud Runだけのroles/run.invokerを持ち、WIF委譲は対象リポジトリ・対応Environmentのsubjectだけに限定する。SAキーやプロジェクト単位のInvokerは追加しない。初期設定は`setup-verification-iam.mjs`を既存管理用gcloudログインから実行する。`--apply`なしは読み取り専用。

```sh
node scripts/deploy/setup-verification-iam.mjs --environment staging --provider projects/198310540092/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider-cli --apply
node scripts/deploy/setup-verification-iam.mjs --environment production --provider projects/198310540092/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider-cli --apply
```

EnvironmentのSMOKE_SERVICE_ACCOUNTに対応メールを設定する。既存WIF_PROVIDER・SA_EMAILは環境別設定を使用する。検証直前にサービスURLをaudienceとする短命IDトークンを取得する。検証ツールは認証前に準備する。事前判定のデプロイSAにはサービス・Revision読み取りが必要だが、検証SAには渡さない。

| 券種 | 区間 | API | 期間 |
| --- | --- | --- | --- |
| 乗車券 | 茂原→新茂原 | /api/split/auto/ticket | なし |
| 定期券 | 茂原→新茂原 | /api/split/auto/pass | months=3 |
| IC定期券 | 茂原→新茂原 | /api/split/auto/ic-pass | months=6 |

共有fixtureはcases.mjs。各応答でHTTP 200、対象の完全SHA、JSON全体`{"normal":["茂原","新茂原"],"results":[["茂原","新茂原"]]}`を照合する。35秒タイムアウト。初回有効応答前の接続失敗・タイムアウト・識別ヘッダーなし503だけ起動待ち候補として5秒／10秒で最大2回再試行する。起動遅延と断定せず、401/403・アプリエラー・SHA/JSON不一致は即時失敗にする。

stagingではIAMを変更せず、無認証403・別ホストの不正audienceで401/403となることを確認する。不正audience値は`https://deployment-verifier.invalid`で、このホストへ通信しない。production検証SAへの偽装拒否も記録し、実ログのPERMISSION_DENIEDを確認する。単なる通信障害をIAM制限の証拠にしない。

## 集計・記録・復旧

最終集計は先行失敗時も実行し、事前判定、必要な公開、API更新時の直接検証の失敗・キャンセル・予期しないskipを失敗にする。frontendのみではAPI・直接検証を対象外として記録する。

preflight・Revision・direct・resultのartifactは14日保持する。APIの期待/実際SHA、Revision、digest、ステータス、JSON差異、request ID、再試行・所要時間、対象外理由をJSON・Summaryに記録する。API応答・例外の任意文字列や資格情報を保存せず、固定した診断値とトークンのマスクを維持する。

本番成功記録はverificationVersion=2。更新対象、directVerified、publicPathVerified=falseを明示する。成功した両サービス更新・直接検証の記録だけをv2の復旧根拠にする。部分更新も成功記録は残すが復旧根拠にはしない。既存v1の復旧判定は維持し、いずれも対応するrun attemptの成功とDeploymentの過去successを必要とする。後続公開でinactiveになった記録も参照できる。記録保存失敗もActionsの失敗とする。

復旧はmainから手動でmode=restore、main履歴上の完全SHA、理由、components=allを指定する。両サービスを再公開・直接検証する。自動ロールバックは行わない。部分公開の失敗時も旧版へ戻ったとは扱わない。ビルドartifactは1日保持のため、失効時は再ビルドする。

## 受入と通常運用

初回導入のステージングall→frontend→api受入と、本番allによる公開・直接検証・v2成功記録の確認は完了した。導入時だけ使用した本番ゲートのチェックは撤去する。今後はmain更新またはmainからの手動起動で通常の統括公開へ進む。環境別排他、開始時のmain先頭照合、IAM、API更新時の直接検証は継続する。

ゲート撤去PRのマージ後、production Environmentの`DEPLOYMENT_VERIFICATION_PRODUCTION_ENABLED`を削除する。チェックが残るmainで先に変数を削除すると公開が失敗するため、この順序を守る。受入用ブランチとローカル一時ファイルは整理し、Actionsの成功記録・検証artifact・本番復旧用Deployment記録は保持期間に従って維持する。

ローカルでは既存automation・verificationテスト、通常のローカルE2E、actionlint・ShellCheck・ESLint・Knipを実行する。検証器の失敗テストは期待値やローカル通信を変更し、共有アプリ・IAMを壊さない。削除した公開検証専用テストは実行しない。

ポートフォリオには「新APIの直接検証」「固定3ケース」「公開経路は対象外」を示す。frontendのみは公開後動作未検証であることも示す。過去の公開経路の失敗・ローカル試験と、新方針の実環境成功を区別する。過去traceはURL・本文・個人情報・内部情報まで確認してから外部公開する。

## 2026-10-22: 新方針のステージング受入

対象SHAはPR #888反映後の`def1f5d56f5e17277a80110a924f9cebb791ad31`。同じSHAを指す`ci/staging-acceptance-20261022`に対し、all→frontend→apiの順に実行し、3パターンすべて最終成功した。

| 更新対象 | 実行 | 実行日時（JST） | 所要時間 | 結果 |
| --- | --- | --- | --- | --- |
| all | [39726821946](https://github.com/tojoryohei/kippu-navi/actions/runs/39726821946) | 14:13:49〜14:20:55 | 7分6秒 | 両公開・Revision照合・直接検証・集計成功 |
| frontend | [39727566586](https://github.com/tojoryohei/kippu-navi/actions/runs/39727566586) | 14:21:34〜14:24:09 | 2分35秒 | 公開・集計成功。APIと直接検証は対象外 |
| api | [39727876203](https://github.com/tojoryohei/kippu-navi/actions/runs/39727876203) | 14:24:47〜14:29:18 | 4分31秒 | API公開・Revision照合・直接検証・集計成功 |

allとapiの直接3券種は、HTTP 200・期待JSON・バイナリ内SHA一致で、それぞれ計641ms／615ms、再試行0回。両実行とも無認証403・不正audience401を確認。allの実ログで、staging主体によるproduction検証SAの偽装がiam.serviceAccounts.getOpenIdTokenのPERMISSION_DENIED（403）で拒否されたことを確認した。

- allの配信Revision: `calculation-engine-staging-00091-6z8`。digest: `sha256:f1ba8785f910b1acbfc527b3e03f3c0717adb82b39727796271d02f2eb39a9d5`。
- apiの配信Revision: `calculation-engine-staging-00092-54b`。digest: `sha256:6a7ba492f0addd90304ff498107a6a584c39617bbab12bd253379b27a4c614e5`。
- 両実行のメタデータSHA・実応答SHAは対象と一致。frontendのみのexpectedApiShaはnull、directReasonはnot_applicable_api_unchanged。apiのみのfrontendArtifactShaはnull、frontendVerificationはnot_applicable_frontend_unchanged。
- すべてpublicPathVerified=false。公開サイトへの通信・WASM取得・ブラウザー計算は実行していない。

### 初回本番公開と完了確認

3パターンの成功後にproduction EnvironmentのDEPLOYMENT_VERIFICATION_PRODUCTION_ENABLEDをtrueへ変更し、読み返して確認した。[初回本番all実行39728381483](https://github.com/tojoryohei/kippu-navi/actions/runs/39728381483)は14:30:09〜14:36:57 JST（6分48秒）で最終成功。対象は受入済みの同じSHA `def1f5d56f5e17277a80110a924f9cebb791ad31`。

- フロントエンド・API公開、IAM確認、配信Revision・メタデータSHA・image digest照合、直接検証、最終集計がすべて成功。
- 配信Revision: `calculation-engine-00045-qs7`。digest: `sha256:20e292f33002285bbf619baefc6b161d6edc9b450f5b179ef5cb913f1eae4d22`。
- 直接検索は乗車券・定期券3箇月・IC定期券6箇月のすべてでHTTP 200・期待JSON・バイナリ内SHAが一致。計1,131ms、再試行0回。メタデータSHAも対象SHAと一致。
- GitHub Deployment ID `7244673811`のverificationVersion=2、frontendUpdated=true、apiUpdated=true、directVerified=true、publicPathVerified=falseと、そのsuccess status・実行URLの一致を読み取り確認した。復旧根拠の記録条件を満たしているが、実際の復旧操作は行っていない。
- 完了確認時点では本番ゲートをtrueに設定済み。導入後のゲート撤去とは区別する。今後のmain更新は通常の統括公開へ進み、API更新時には直接検証が必須となる。過去のゲート停止runは失敗の履歴として残し、再実行しない。

**Cloud Run直接検証を必須とする新方針の受入と初回本番確認は完了した。** フロントエンドSHAはartifactの確認のみであり、公開サイト・Cloudflare接続・公開WASM・画面上の計算結果は検証していない。固定3ケースの成功を全経路の計算正確性の保証とはしない。artifactは各runで14日保持する。以下の旧方針の失敗履歴は、この受入結果とは区別する。

## 旧方針の実測記録（履歴）

コード内の検証器テストと、実環境の受入結果は分けて記録する。新ワークフローはmainの制御コードから動かすため、ローカルの成功だけでActionsやstagingを検証済みとしない。本番の有効化変数はステージング受入完了まで設定しない。

### 2026-10-21: 実装・初期設定と既存ステージングでの検証

- 両環境の検証SA、対応サービスだけのInvoker、該当Environment subjectだけのWIF委譲を作成。既存Cloudflare InvokerとallUsers非許可を維持。
- 両Environmentの`SMOKE_SERVICE_ACCOUNT`を設定し、productionの`DEPLOYMENT_VERIFICATION_PRODUCTION_ENABLED=false`を読み返して確認。
- 実ステージングの配信先は`calculation-engine-staging-00088-grc`の100%。比較用`DEPLOY_COMMIT`が未設定なので、初回API更新は省略されない。
- 新しいpreflightを読み取り専用で実行し、配信Revisionと既存フロントエンドSHAの取得に成功。
- **既存公開済みステージング**のSHA `aa7cb7dd82f6dac0869bca0fa08f8e2bf3c1e688`に対し、新しいHTTP検証器でmanifestと3 APIを確認。すべて200、期待JSON一致。計1,839ms、観測したcache statusはすべてBYPASS。
- 同じ既存ステージングに公開ブラウザー検証を通信差し替えなしで実行し、3券種すべて成功（計7.4秒）。期待金額、実API、ハッシュ付きWASMの取得を確認。
- ローカルのブラウザー検証器テスト7件が成功（正常系3件、API/WASM/金額不一致の失敗検出3件、応答の識別1件）。Worker 61件、automation/HTTP/policy計21件、artifact検証7件、Go API raceテストが成功。
- 型検査、Knip、actionlint 1.7.12＋ShellCheck 0.11.0が成功。ESLintはエラー0（既存項目とテストの固定パス読み取りに対する警告あり）。

これらは新ワークフローを使ったデプロイ成功の記録ではない。**main反映後のActionsによるall/frontend/apiの受入、GitHub OIDC経由の直接検証・認証拒否検証、成功Deployment記録と明示的復旧は未実施**。本番の有効化はその受入後に行う。



### テスト整理後の最終確認

ワークフローの文言・コード記述順をなぞる検査を削減し、資格情報境界の回帰検査を残した。ブラウザー検証器は既存の開発サーバーE2Eに集約し、専用のローカル設定・CIの追加起動を削除した。APIのキャッシュ方針検査も既存ケースへ環境別に統合した。

整理後のautomation/HTTP/policy計18件と、既存ケースを含む開発サーバーE2E計18件が成功。Goの`go test ./...`、Worker 61件、artifact検証7件も成功。公開環境の受入と検証器のローカル失敗検出は引き続き分けて扱う。


### 検証器の通信と診断情報の境界

通信先と検索入力は固定のコード定義から選び、設定ファイルの内容をそのまま外向き通信へ渡さない。APIの実応答は全体で期待JSONと比較するが、保存時は正常なSHA・UUID・HTTPステータス・キャッシュ状態・JSONの型と区間差異だけを記録する。未知の文字列・余分な本文・任意の例外メッセージは保存せず、異常な値は型や件数で示す。異常な応答でも保存量を制限し、トークンのマスクも維持する。

### 2026-10-22: 新統括ワークフローによる初回受入（未完了）

対象はmainと同じ完全SHA `01ba6553af63f0da32dfda9616ebd6d292f520e4`を指す専用ブランチ`ci/staging-acceptance-20261022`。本番ゲートは変更していない。

[両サービス実行 39718678167](https://github.com/tojoryohei/kippu-navi/actions/runs/39718678167)は12:46:22〜12:54:00 JST、7分38秒で失敗。フロントエンド・API公開、IAM検証、実配信Revision・メタデータSHA・image digest照合は成功した。Revisionは`calculation-engine-staging-00089-w4b`、digestは`sha256:b794712f3c9ed557cb5d313dada2f97ada7f29ee77e3633e6eca7aab4b8ef174`。

- 正常な直接検索3券種はHTTP 200・期待JSON・バイナリ内SHA一致。計745ms、再試行0回。
- 無認証要求は403。不正audienceとしてサービスURLへパスを追加した要求は200となり、拒否検証が失敗した。別ホストの`https://deployment-verifier.invalid`へ変更する。これはトークンのaudience値であり、このホストへHTTP要求は送らない。変更後の実環境での拒否確認は未実施。
- 公開HTTPとブラウザー3ケースは、manifest応答をJSONとして読めず失敗した。既存の失敗記録ではHTTPステータスが欠落しており、Cloudflareの制限・配信遅延など原因は未確定。非JSON時もステータス・限定したContent-Type・チャレンジ有無・キャッシュ状態を記録するよう補強し、応答本文は保存しない。
- 直接正常応答の成功だけで受入成功とはしない。環境越境の拒否確認は先行失敗によりスキップされたため、証明できていない。traceは外部公開していない。

制御コードはmain固定のため、修正PRのマージ後にallを再実行し、成功後にfrontend/apiを確認する。APIのみは既知の認証拒否検証失敗が解消するまで起動しない。本番の有効化条件は満たしていない。

[フロントエンドのみ実行 39719409661](https://github.com/tojoryohei/kippu-navi/actions/runs/39719409661)は12:54:28〜12:58:27 JST、3分59秒で失敗。事前判定・フロントエンド公開は成功、API公開と直接検証は意図どおり対象外としてスキップされた。公開HTTPは128msで同じmanifest非JSONエラー、ブラウザー3ケースも同じ理由で失敗した。両サービス実行と同じ問題が再現しており、公開経路の受入も未完了。


### 2026-10-22: PR #886反映後の旧方針での再受入

[実行39720606353](https://github.com/tojoryohei/kippu-navi/actions/runs/39720606353)、対象SHA `fa0ab56a6e4eddbd5ce3003ce4c40d31045841e9`。13:07:34〜13:15:41 JST（8分7秒）。両公開とRevision照合、直接3券種は成功（計882ms）。配信Revisionは`calculation-engine-staging-00090-l9p`、digestは`sha256:1032dae8d5a0195faacd815e6c22a9283552ed26ac3f374502d0557d16ff8d0f`、メタデータ・バイナリ内SHAは対象と一致した。

無認証403、不正audience401。環境越境の偽装はiam.serviceAccounts.getOpenIdTokenのPERMISSION_DENIED（403）で拒否。公開manifestは403・text/html・cf-mitigated: challengeで失敗（363ms）し、ブラウザー3ケースも失敗した。Cloudflare管理画面でも該当要求のBot Fightモードによるマネージドチャレンジを確認。旧方針の全体結果は失敗のまま保持し、新方針の受入成功として流用しない。Cloudflare保護設定・本番ゲートは変更していない。
