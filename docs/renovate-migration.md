# Renovate移行とCIによるマージ判定

## 更新方針

依存更新PRとセキュリティ修正PRの作成・自動マージはRenovateが担当します。
Dependabotの更新設定と専用自動マージworkflowは廃止します。GitHub側のDependabot security updatesは停止し、Dependabot alertsは検出元として維持します。

マージ条件は既存の必須CI・CodeQLと最新mainへの追従です。
共有stagingの公開結果はマージ条件にせず、専用Appの`Staging verification`も使用しません。
2026-10-18にmainの必須条件から`request`を除外しました。通常CIと最新mainへの追従は維持しています。
共有環境の競合やCloudflareによる実行元の拒否で依存更新を止める構成にはしません。
通常CIが通っても本番の画面・計算結果・外部サービスとの連携を保証するものではありません。
majorを含む更新の自動マージではそのリスクを受け入れ、朝に失敗・保留PRと本番デプロイ結果を確認します。
CIに失敗した破壊的変更は自動修復される前提にしません。

通常更新の新規ブランチ作成は日本時間3:00以上6:00未満とし、公開後3日待機します。
`updateNotScheduled: true`で既存PRの更新・rebaseは時間外も許可します。
先行PRのマージでmainが進んだ場合は、Renovateの次回巡回で後続PRを自動rebaseし、必須CIを再実行します。
`platformAutomerge: true`でGitHubの自動マージを予約し、必須条件が揃った時点でマージします。
マージ時刻は3〜6時に限定せず、時間外のマージも許可します。
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

通常ブランチ・Renovateブランチとも、main以外へのpush、main向けの同一リポジトリPRの作成・再オープンで`Staging request`を起動し、要求の完了後に`Deploy staging`が共有stagingへ自動公開します。PRのない開発ブランチもpushで公開できます。
CIとは独立して公開を進めます。外部fork、要求元ブランチの削除、要求時のSHAから先端が進んだ場合は公開しません。PR更新時はpushを契機にし、PRの`synchronize`イベントは重ねて登録しません。
手動公開はActionsの`Deploy staging`をmainから起動し、同一リポジトリの非mainブランチを指定します。PRのないブランチも手動公開できます。
公開要求では対象ブランチのコードや資格情報を使いません。公開処理はmainの制御コードから起動し、排他待機後にも対象SHAと現在のブランチ先端を照合します。
mainのworkflow定義を用い、固定した対象SHAからフロントエンドとAPIを順番に公開します。
自動・手動公開は共通concurrencyで排他制御し、自動公開ではフロントエンドとAPIの両方を更新します。共有環境は最後に公開したブランチの内容になります。待機実行が置き換えられた場合は必要に応じて公開要求の再実行または手動公開を使います。
stagingデプロイの成功・失敗はPRのマージ条件にしません。Cloud Run直接検証は維持し、Cloudflare経由の公開疎通確認は復活させません。
本番は既存どおりmainへのマージ後に公開します。frontend/API個別workflowの手動実行もmainの本番用です。

既存のstaging専用SHAヘッダーとキャッシュ分離は調査用に維持します。
専用チェックAppと`staging-checks` Environmentはworkflowから参照しなくなります。
これらのGitHub側の削除はこのPRでは行いません。Appの登録や秘密鍵は今後の導入条件ではありません。

自動起動の復元は、この変更をmainへ反映した後の公開要求から有効になります。既存ブランチでpushを契機にするには、`staging-request.yml`を含むmainを取り込んでください。既存PRをそのまま公開する場合は手動公開も使えます。

## 運用と移行の証跡

移行確認の結果と残る制約は[renovate-cutover.md](renovate-cutover.md)に記録します。
通常更新の新規ブランチ作成は日本時間3〜6時、既存PRの更新・rebaseと脆弱性修正は時間外も処理します。マージはGitHub側で必須条件が揃い次第実行します。
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
