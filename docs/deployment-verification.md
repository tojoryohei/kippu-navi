# デプロイ後の検証と復旧

## 検証範囲

| 更新対象 | Cloud Run直接 | 公開HTTP・ブラウザー |
| --- | --- | --- |
| 両方 | API公開・IAM・Revision照合後に実行 | 両方公開後に実行 |
| フロントエンドのみ | 対象外と記録 | 必須 |
| APIのみ | 必須 | 必須。既存フロントエンドSHAの維持も確認 |

直接検証はCloudflareを経由せず、新しく公開されたAPIバイナリのSHAと3券種の検索JSONを確認する。公開検証は通常のキャッシュ条件で利用者の経路を確認し、キャッシュ中のAPIヘッダーが新APIのSHAと異なることは許容する。直接検証が失敗しても公開結果を記録し、最終結果は失敗にする。

固定3ケースでは全経路の計算正確性、公開APIのキャッシュ更新、すべてのブラウザーや既存PWAタブは保証しない。実際のキャッシュHITが記録されていないテストを「キャッシュされた実環境での証明」と表現しない。

## 起動経路と排他制御

- 本番: `deploy-production.yml`。main pushは`components=auto`。手動はauto/all/frontend/apiを選択する。
- ステージング: mainから`deploy-staging.yml`を起動し、同一リポジトリの非mainブランチを指定する。既定はall。待機後にもブランチ・PRのSHAを再確認する。
- 両入口は`deploy-release.yml`を呼び、`deployment-production`または`deployment-staging`の同じ排他区間を取得する。
- 既存のfrontend/APIワークフローは再利用専用。外部の資格情報がないbuildと、control_shaを使う公開処理の分離は維持する。

通常の本番公開では、排他取得後、公開開始時のmain先頭と対象SHAを照合して固定する。途中でmainが進んでも同じ実行内では継続する。古い実行の対象を新しいmainへ読み替えない。

開始確認はrun ID・attempt・SHA・環境に結び付ける。古い確認を使う「失敗ジョブだけ再実行」は公開を拒否する。統括から**全ジョブを再実行**する。それでも対象が古ければ通常公開は拒否されるため、最新mainの新しい実行を利用する。

## API更新判定と識別情報

Cloud Runの実配信状態がReady・観測済みで、正のトラフィック割合を持つRevisionが1つ、合計100%の場合だけ、そのRevisionの実行時`DEPLOY_COMMIT`を比較元にする。latestCreated/latestReadyの順序は使わない。0%のタグ付きRevisionは基準にしない。

分割配信、未確定状態、基準SHA不明、浅い履歴、commit不足、差分取得失敗ではAPI更新を省略しない。`frontend`を明示していても、この条件では公開を拒否しallでの再実行を求める。

比較は基準SHAと対象SHAのツリー間。`calculation-engine/**`、`.github/workflows/**`、`scripts/**`、`.dockerignore`、`.node-version`、`.npmrc`、`package.json`、`package-lock.json`、`wrangler.jsonc`、`astro.config.mjs`、`tsconfig.json`の変更をAPI更新対象にする。

- Revisionの実行時`DEPLOY_COMMIT`: 次回の差分判定用。
- バイナリ内SHA→`X-Deployment-Commit`: 直接応答の証拠。実行時変数で上書きしない。
- `/deployment.json`: フロントエンドの環境・SHA・enginePath。

API公開では対象SHAを実行時メタデータにも指定し、新Revisionへ100%配信する。Ready・実配信先・メタデータSHA・image digestを照合してから、専用SAで直接検索する。本番ヘッダー追加でキャッシュ方針を変えず、stagingのno-storeを維持する。

## 初期設定

既存のEnvironment保護・承認ルールを維持する。検証SAはデプロイSA・Cloudflare Invokerとは別で、キーを作成しない。

以下は管理用の既存gcloudログインで実行する。`--apply`なしはWIFを読み取って具体的な設定内容を表示するだけ。

```sh
node scripts/deploy/setup-verification-iam.mjs --environment staging --provider projects/198310540092/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider-cli --apply
node scripts/deploy/setup-verification-iam.mjs --environment production --provider projects/198310540092/locations/global/workloadIdentityPools/github-actions-pool/providers/github-provider-cli --apply
```

作成するSA:

- staging: `github-smoke-staging@bubbly-trail-470023-e4.iam.gserviceaccount.com`
- production: `github-smoke-production@bubbly-trail-470023-e4.iam.gserviceaccount.com`

それぞれのSAに、既存WIFの**同一リポジトリ・該当Environmentのsubjectだけ**を`roles/iam.workloadIdentityUser`として許可する。各Cloud Runサービスに、対応するSAだけの`roles/run.invoker`を追加する。プロジェクト単位のロールやToken Creatorは追加しない。

GitHub Environment Variablesへそれぞれのメールを`SMOKE_SERVICE_ACCOUNT`として設定する。既存`WIF_PROVIDER`・`SA_EMAIL`は引き続きEnvironmentごとの設定を使う。事前判定のデプロイSAにはサービス・Revisionの読み取りが必要で、専用検証SAにその権限は渡さない。

本番はEnvironment Variable `DEPLOYMENT_VERIFICATION_PRODUCTION_ENABLED=true`になるまで、ビルド・公開に進まない。mainへの初回導入後も先にステージングの受入を完了させる。変数未設定中の本番実行は意図的に失敗する。

## 直接検証とブラウザー検証

期待ケースは`cases.mjs`に固定し、API例の既存テストでも共有する。

| 券種 | 入力 | APIのmonths | 画面の期待金額 |
| --- | --- | --- | --- |
| 乗車券 | 茂原→新茂原 | なし | 160円 |
| 定期券 | 茂原→新茂原 | 3 | 13,960円 |
| IC定期券 | 茂原→新茂原 | 6 | 26,620円 |

金額はリポジトリのJR東日本の3km運賃、幹線定期運賃表の3km欄、対象区間の非バリアフリー設定から固定した。実測から自動更新しない。運賃データ変更時は根拠を確認してfixtureをレビューする。

3 APIとも期待JSONは`normal=[茂原,新茂原]`、`results=[[茂原,新茂原]]`。HTTP 200とJSON全体を比較する。直接検証だけバイナリSHAも比較する。

直接HTTPは35秒でタイムアウト。最初の有効応答前の接続失敗・タイムアウト・識別ヘッダーなし503だけ、起動待ち候補として5秒/10秒で最大2回再試行する。起動遅延と断定しない。認証、アプリエラー、SHA/JSON不一致は即時失敗。公開HTTP・Playwrightのテスト再試行はしない。

公開ブラウザーはChromiumの新規コンテキストで、3券種の入力・期間を選択して検索する。操作前に、同一origin・GET・パス・駅・期間が一致するAPI応答待機を登録する。実APIの正常JSON、対象WASMの200・magic、区間・期間・分割前/最安金額の表示で判定する。内部Workerメッセージ形式は合否条件にしない。公開API障害をローカルフォールバック成功で代替しない。

## 受入検証と検証器のテスト

検証器のテストはローカルで行う。共有stagingのアプリ・IAMは壊さない。

```sh
node --test tests/automation/*.test.mjs tests/verification/*.test.mjs
npx playwright test --config playwright.dev.config.ts deployment-verifier.spec.mjs
```

- SHA/JSON不一致: 検証器の期待値だけ変更。
- API/WASM障害: 検証器のローカルテストで通信失敗を再現。
- 集計: 公開成功＋直接失敗でも全体失敗。必須ジョブのskipも失敗。
- 判定/ガード: 配信中・ロールバック・分割配信・履歴不足・共通設定変更・古いrun/attemptの拒否。

実環境の通常受入では通信を差し替えず、stagingでall/frontend/apiの3通りを実行する。初回はall必須。stagingの直接検証ではIAMを変更せず、無認証・不正audienceの要求が401/403となることも確認する。production検証SAへの環境越境の偽装失敗は別ステップに記録し、実ログで権限拒否が原因であることを確認する。単なるネットワーク障害によるAction失敗をIAM制限の証明にしない。

受入完了後に本番の有効化変数を設定し、初回本番はallで実行する。

## 記録・再実行・復旧

各runでpreflight、Revision照合、direct、public、resultのartifactを14日保持する。公開検証のJSON、API差分、期待/実際のSHA、request ID、所要時間、失敗時のtrace・スクリーンショットを確認する。資格情報ファイルをartifactに含めず、トークンは出力しない。

ブラウザートレースを外部公開する前には、認証情報以外も含めてURL・本文・個人情報・内部情報を確認する。ポートフォリオには対象SHA・日時・検証範囲・正常/失敗検出の違いを添える。保持期間を超えて紹介する場合は、内容確認済みの記録を別途保存する。

自動ロールバックはしない。部分公開後の検証失敗でも両サービスが旧版へ戻ったとは扱わない。前述の全ジョブ再実行か、必要なら次の明示的復旧を選ぶ。ビルドartifactは既存どおり1日保持なので、失効時は新しくビルドする。

復旧は`deploy-production.yml`をmainから手動起動し、mode=restore、対象の完全SHA、理由を指定する。componentsはallに固定される。対象がmain履歴上にあり、検証導入後の成功した統括runに結び付く本番Deployment成功記録がある場合だけ受け付ける。古い任意SHAの通常公開は許可しない。

本番正常公開後、GitHub Deploymentsへバージョン付きの成功記録を残す。記録に対応するrun attemptが失敗、記録なし、または本検証導入前なら拒否する。後続デプロイでinactiveになった履歴でも、記録したattemptの成功と過去のsuccess statusを確認できれば復旧対象にできる。記録保存に失敗した場合もrunを失敗とし、自動復旧対象として登録されたとは扱わない。

## 導入時の実測記録

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
