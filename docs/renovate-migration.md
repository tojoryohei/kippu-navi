# Renovate移行とCIによるマージ判定

## 更新方針

Renovateの通常更新と脆弱性修正の自動マージは導入確認が終わるまで無効です。
Dependabotの更新・セキュリティ修正・自動マージは切り替えまで維持します。

マージ条件は既存の必須CI・CodeQLと最新mainへの追従です。
PRごとの共有stagingへの自動デプロイ、疎通確認、専用Appの`Staging verification`は廃止します。
2026-10-18にmainの必須条件から`request`を除外しました。通常CIと最新mainへの追従は維持しています。
共有環境の競合やCloudflareによる実行元の拒否で依存更新を止める構成にはしません。
通常CIが通っても本番の画面・計算結果・外部サービスとの連携を保証するものではありません。
majorを含む更新の自動マージではそのリスクを受け入れ、朝に失敗・保留PRと本番デプロイ結果を確認します。
CIに失敗した破壊的変更は自動修復される前提にしません。

通常更新は日本時間3:00以上6:00未満に作成・更新・マージし、公開後3日待機します。
公開日時不明は待機条件で止めません。ホスト型Appの巡回時刻や当日中の完了は保証しません。
CIとマージ後の本番デプロイは6時を過ぎても完了まで続けます。
脆弱性修正はGitHub Dependabot alertsで検出され、Renovateが修正PRを生成できるものに限定します。
通常グループから分離して最小修正版を優先し、待機なし・随時処理します。必須CIは省略しません。

## stagingと本番デプロイ

通常ブランチとRenovateブランチのpush・PR作成からstagingへは自動公開しません。
必要時のみActionsの`Deploy staging manually`をmainから起動し、同一リポジトリの対象ブランチを指定します。
main以外からのworkflow起動、外部fork、実行開始時に最新headと一致しない対象は拒否します。
mainのworkflow定義を用い、固定した対象SHAからフロントエンドとAPIを順番に公開します。
手動実行同士は共通concurrencyで排他制御します。待機実行が置き換えられた場合は必要に応じて再実行します。
手動stagingデプロイの成功・失敗はPRのマージ条件にしません。
本番は既存どおりmainへのマージ後に公開します。frontend/API個別workflowの手動実行もmainの本番用です。

既存のstaging専用SHAヘッダーとキャッシュ分離は調査用に維持します。
専用チェックAppと`staging-checks` Environmentはworkflowから参照しなくなります。
これらのGitHub側の削除はこのPRでは行いません。Appの登録や秘密鍵は今後の導入条件ではありません。

## 導入と切り替え

1. Mend Renovate Appを対象リポジトリへインストールし、Dependabot alertsの読み取りを許可します。
2. npmは`.npmrc`とRenovateの`npmrc`で`https://npm.flatt.tech/`を指定します。GoはMendのホスト側で`GOPROXY=https://golang.flatt.tech`を指定できることを確認します。取得失敗時に公開レジストリへ迂回しません。
3. 自動マージ無効のまま実更新PRで取得・lockfile更新・必須CIの成功を確認します。
4. 検証済みPRをユーザーがブラウザで手動マージし、既存の本番デプロイの成功を確認します。stagingの公開や疎通確認は切り替え条件ではありません。
5. main ruleset（ID: 15000488）の既存条件を保存し、更新用JSONを生成します。

   ```sh
   gh api repos/tojoryohei/kippu-navi/rulesets/15000488 > /private/tmp/kippu-main-ruleset-before.json
   node scripts/staging/protection.mjs /private/tmp/kippu-main-ruleset-before.json > /private/tmp/kippu-main-ruleset-after.json
   ```

   既存CI・CodeQLを維持し、`Required CI`をGitHub Actionsに固定します。
   廃止する`deploy`・`request`・`Staging verification`とDependabot専用チェックを必須条件から除きます。
   最新mainへの追従を必須にし、bypassは認めません。内容を確認してrulesetに反映します。
6. Dependabotの通常更新・専用自動マージworkflowを停止します。alertsは維持し、修正PRの担当をRenovateへ切り替えて重複PRを整理します。
7. `renovate.json`の通常・脆弱性修正の`automerge`を有効化し、1週間観察します。通常更新が時間外に自動マージされた場合は停止して調査します。

## 検証と切り戻し

`node --test tests/automation/*.test.mjs`、`node scripts/check-runtime-versions.mjs`、actionlint、Renovate設定validatorで設定を確認します。
Nodeと型定義、GoとDockerの系列が異なるPRはCIで停止します。必要時は手動で揃えます。
問題時は通常・脆弱性修正の自動マージを無効化し、必要ならDependabotの更新設定と専用workflowを復元します。
アプリケーションの復旧は影響するコミットを特定して別途判断します。自動revertは追加しません。
