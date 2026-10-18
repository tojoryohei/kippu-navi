# Renovate移行とCIによるマージ判定

## 更新方針

依存更新PRとセキュリティ修正PRの作成・自動マージはRenovateが担当します。
Dependabotの更新設定と専用自動マージworkflowは廃止します。GitHub側のDependabot security updatesは停止し、Dependabot alertsは検出元として維持します。

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

## 関連依存のグループ

React本体・DOM・型定義、Astroと連携パッケージ、Tailwind、Sentry、Node実行環境、Go実行環境をそれぞれまとめます。
ESLint本体と各プラグイン・`@typescript-eslint/*`は`eslint`グループとし、TypeScript本体は個別更新にします。
ESLintとTypeScriptの独立したmajor更新を同じPRへまとめません。
TypeScriptのmajor移行時には別グループの`@astrojs/check`と`@typescript-eslint/*`のpeer対応も確認します。
Reactのmajor移行時にも`@astrojs/react`やUIライブラリの対応が必要です。グループ化はpeer互換性を保証せず、依存解決と必須CIで判定します。
`allowScripts`はインストールスクリプトの許可方針であり、依存グループとは別に管理します。
未使用のバージョン指定は整理し、新しいバージョンのスクリプトを許可する際は内容を確認します。

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

## 運用と移行の証跡

移行確認の結果と残る制約は[renovate-cutover.md](renovate-cutover.md)に記録します。
通常更新のPR作成・更新・マージは日本時間3〜6時、脆弱性修正は随時処理します。
mainのrulesetには個別CI・CodeQLと最新mainへの追従を必須指定し、bypassは認めません。
依存更新用の旧チェック`dependabot-auto-merge`は削除します。

npmは`.npmrc`とRenovate設定で`https://npm.flatt.tech/`を使用し、取得失敗時に公開レジストリへ迂回しません。
Goは現在外部モジュール依存がなく、Goランタイム更新のみが実検証対象です。
外部Goモジュールを追加する際はMendホスト側の`GOPROXY=https://golang.flatt.tech`を検証してから更新を管理します。
ホスト側の設定を確認せず、リポジトリの`env`設定だけで強制できるとは扱いません。

## 検証と切り戻し

`node --test tests/automation/*.test.mjs`、`node scripts/check-runtime-versions.mjs`、actionlint、Renovate設定validatorで設定を確認します。
Nodeと型定義、GoとDockerの系列が異なるPRはCIで停止します。必要時は手動で揃えます。
問題時は通常・脆弱性修正の自動マージを無効化し、必要ならDependabotの更新設定と専用workflowを復元します。
アプリケーションの復旧は影響するコミットを特定して別途判断します。自動revertは追加しません。
