# Renovate移行とstaging検証

## 導入状態

この変更は導入準備段階です。Dependabotの更新・セキュリティ修正・自動マージはまだ残しています。
`renovate.json`の通常更新と`vulnerabilityAlerts`の`automerge`は両方falseです。
2026-10-18にGitHubの`staging-checks` environmentを作成し、許可ブランチをmainだけに設定済みです。専用AppのID・秘密鍵は未登録です。
実更新PR、staging、本番での確認前にtrueへ変更しないでください。

通常更新は日本時間3:00以上6:00未満に作成・更新・マージし、公開後3日待機します。
公開日時が不明なら待機条件で止めません。ホスト型Appの巡回時刻・当日中の完了は保証しません。
開始したCI・デプロイは6時を過ぎても完了まで続きます。
majorを含む更新を最終的に自動マージ対象にしますが、CIやstagingが検出できない計算結果・画面の不具合のリスクは残ります。
朝は失敗・保留PRと本番デプロイ結果を確認します。破壊的変更によるCI失敗は自動修復されません。

脆弱性修正はGitHub Dependabot alertsで検出され、Renovateが修正PRを生成できるものに限定します。
全依存やDockerの脆弱性を網羅する仕組みではありません。修正は通常グループから分離し、最小修正版を優先して待機なし・随時マージします。
必須CIとstaging検証は省略しません。

## 信頼境界とデプロイ

`Staging request`は同一リポジトリの開発ブランチpushとPR作成・再開を通知するだけで、コードや成果物を実行しません。
`Deploy and verify staging`はdefault branchのworkflow_runからリクエストの実体・リポジトリ・ブランチ・最新head SHAを検証します。
外部forkは自動デプロイ対象外です。同一リポジトリへレビュー済みブランチを取り込んで検証します。

通常ブランチ、Renovate、手動実行は共通のconcurrency groupで、フロントエンド→API→疎通確認→結果発行の順に処理します。
APIに変更のないPRでも両サービスを対象SHAからデプロイします。
GitHubは待機中のrunを新しいrunで置き換える場合があります。実行中は取り消しませんが、待機runのFIFO・全件実行は保証しません。
未検証runは成功になりません。Actionsで`Deploy and verify staging`を**mainから**手動実行し、対象ブランチを入力して再実行できます。
旧frontend/API workflowの手動実行はmainの本番用です。stagingは必ず統合workflowを使います。

デプロイjobにはビルド・クラウド公開の資格情報があります。PRコードを扱うため、同一リポジトリの書き込み権限は信頼されたメンバーに限定します。
専用チェックのApp秘密鍵・tokenは別の`staging-checks` environmentのpublisher jobだけが持ちます。
デプロイjobへ`secrets: inherit`は使いません。publisherと疎通確認はworkflow自身のコミットのコードを使い、PRコード・PR成果物を読み込みません。
クラウド操作のworkflow定義自体も信頼済みmain側を使用します。候補のNode/Go/Wrangler指定とソースは対象SHAから読み込みます。
候補PRで変更されたデプロイAction定義そのものがマージ前に実行される保証はありません。

APIのビルド元SHAはバイナリに埋め込み、stagingだけ`X-Deployment-Commit`に返します。本番には付与しません。
staging APIはCDNキャッシュを使いません。本番のキャッシュ方針は維持します。
画面・主要アセット・乗車券/定期券/IC定期券検索を確認し、検索の応答SHAと前後のdeployment.jsonを照合します。
結果発行前にもブランチ・PRのheadを再確認します。新しいSHAは必ず新しい検証が必要です。
成功は「そのSHAの両サービスを同時に公開して確認した証跡」です。確認後の別ブランチのstaging更新で過去の成功は取り消しません。
キャンセル・失敗・SHA不一致・skip・タイムアウトは成功扱いにしません。publisherまで到達しなければチェックは未完了のままなので、再実行が必要です。

## GitHub側の準備（このコードだけでは有効にならない）

1. 専用GitHub Appを作成し、このリポジトリだけへインストールする。Repository permissionsはChecks: read/write、Metadata: readのみ。Webhookは不要。
2. `staging-checks` environmentを作成し、deployment branch policyを**mainのみ**に制限する。
   - environment variable: `STAGING_CHECK_APP_ID`（installation IDではなくApp ID）
   - environment secret: `STAGING_CHECK_APP_PRIVATE_KEY`
   - 秘密鍵をrepository secretやstaging/production environmentへ複製しない。
3. 既存staging environmentの制約とGCP WIF条件が、main由来の統合workflowからstagingへデプロイできることを確認する。WIFを全ブランチへ緩めない。
4. Mend Renovate Appをこのリポジトリに限定してインストールし、Dependabot alertsの読み取りを許可する。
5. `GOPROXY=https://golang.flatt.tech`をMendのホスト側の許可された環境設定で指定する。リポジトリ設定だけで任意envを強制できる前提にしない。
   npmは既存`.npmrc`とRenovateの`npmrc`で`https://npm.flatt.tech/`を指定する。取得に失敗したら公開レジストリへ迂回せず停止する。

## 検証・切り替え順序

1. 上記App/environmentの準備後、この変更をレビューしてブラウザでmainへマージする。Dependabotはまだ停止しない。
2. Renovateを自動マージ無効のまま稼働し、実更新PR生成・Takumi Guard経由の取得・lockfile更新を確認する。
3. PRの全CIと最新SHAの`Staging verification`が成功することを確認する。npmのみの更新でもAPIが公開されること、古いSHAの結果を流用しないことを確認する。
4. 検証済みPRをブラウザでマージして本番デプロイまで確認する。未検証の対象は未検証と記録する。問題があればDependabotを残す。
5. main ruleset（確認時ID: 15000488）の既存条件を保存し、下記のプレビューを作成する。

   ```sh
   gh api repos/tojoryohei/kippu-navi/rulesets/15000488 > /private/tmp/kippu-main-ruleset-before.json
   node scripts/staging/protection.mjs /private/tmp/kippu-main-ruleset-before.json APP_ID > /private/tmp/kippu-main-ruleset-after.json
   ```

   `APP_ID`は専用チェックAppの実IDへ置換する。生成物は既存CI/CodeQLを維持し、`dependabot-auto-merge`だけを除き、`Required CI`と専用Appに固定した`Staging verification`を追加する。
   mainへの追従を必須にし、bypassは認めない。内容を確認してGitHubのrulesetへ反映する。
   同名のチェックを別Appが作成しても必須条件を満たさないことを確認する。
6. Dependabotの通常更新設定と専用自動マージworkflowを削除する。Dependabot alertsは維持し、修正PRの担当がRenovateへ移ったことを確認してDependabot security updatesを停止する。
7. 重複PRを整理し、`renovate.json`のトップレベルと`vulnerabilityAlerts`の`automerge`を両方trueへ変更する。全packageRulesの解決結果でもmajorが対象になることを確認する。
8. 1週間、通常PRの作成・更新・マージ時刻と失敗PR・本番デプロイを確認する。時間外の通常マージがあれば自動マージを停止して調査する。

## ローカル検証

- `node scripts/check-runtime-versions.mjs`
- `node --test tests/automation/*.test.mjs`、`npm run test:worker`、`npm run lint`、`npm run typecheck`、`npm run knip`
- `go test ./cmd/api`（calculation-engine内）
- `actionlint`
- CIと同じ固定版Renovateで`renovate-config-validator --strict --no-global renovate.json`
- `RENOVATE_PACKAGE_ROOT`をそのRenovate packageディレクトリに指定して`node scripts/test-renovate-schedule.mjs`

時間の境界値はRenovate本体の判定関数でテストします。Appの巡回時刻は別途実運用で観察します。
Nodeと型定義、GoとDockerの系列が異なるPRはCIで止まります。型定義側のリリースが遅れた場合などは手動で揃えます。

## 切り戻し

通常・脆弱性修正のautomergeを両方falseへ戻し、必要ならRenovate Appの対象から外す。
Dependabotの更新設定・専用workflow・security updatesを移行前から復元する。main保護も保存したrulesetを基に必要なチェックを復元する。
Appの停止だけで依存コードやデプロイが元に戻るわけではない。アプリケーションは影響するコミットを特定して別途復旧する。自動revertは行わない。
