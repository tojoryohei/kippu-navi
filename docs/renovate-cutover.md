# Renovate一本化の移行確認

## 移行確認の結果

Renovateによる更新PR生成・lockfile更新・必須CIと、先行更新の本番公開まで確認済みです。
切り替えPRのマージでDependabotの通常更新設定と専用workflowを削除し、Renovateの自動マージを有効化します。
検証用npm PR #869には公開後3日の待機条件が残っています。CI成功を理由にその待機条件を省略しません。

## 2026-10-18時点の証跡

| 確認項目 | 結果 |
| --- | --- |
| Renovate Appの動作・依存抽出 | Dashboard #860作成、実更新PR生成を確認 |
| Docker digest固定 | #861をマージ済み |
| GoランタイムとDocker系列の更新 | #862をマージ済み、CI成功 |
| Nodeランタイムの更新 | #863をマージ済み |
| Wrangler更新 | #864をマージ済み |
| Actions更新 | #865をマージ済み |
| APIの本番公開 | Actions run 39127545114が成功（#862のマージSHA d93b25f5fb8ddfcbbec6aa22ac55ddaac7c8bd87） |
| フロントエンドの本番公開 | Actions run 39129632215が成功（#865のマージSHA be865e9dff707ed0899fcecccde80875c277d70a） |
| npmの取得先設定 | `.npmrc`、Renovate npmrc、npm datasourceがnpm.flatt.techを指定 |
| npmの実lockfile更新 | #869でpackage-lock.jsonをRenovateが更新。tarball取得先830件すべてnpm.flatt.tech。CI全項目成功（run 39130534020、E2E 113件・開発サーバーテスト11件成功） |
| GitHub Dependabot alerts | 有効。未対応アラート0件 |
| Renovate Appの公開権限 | `vulnerability_alerts: read`を確認。実際の新規脆弱性修正PRはアラート0件のため未実証 |
| セキュリティ修正のrepo設定 | alerts有効、最小修正版、グループ解除、待機なし、時間外処理をvalidatorで確認 |
| 時刻条件 | Renovate本体の時間判定で2:59/3:00/5:59:59/6:00と月曜lockfile枠を検証 |

#866はESLint・TypeScriptのmajor更新でlockfile生成とCIが失敗しているため、移行成功の証跡には使いません。
CI失敗を回避する権限はRenovateに付与しません。

## Goの取得経路の範囲

現在の`calculation-engine/go.mod`には外部モジュール依存がなく、Goの外部依存取得とgo.sum更新は未実証です。
Mend Communityのホスト設定では任意の`customEnvVariables`や`allowedEnv`を変更できるとは限りません。
外部モジュール追加時にはGOPROXYをTakumi Guardのみに固定できることを先に確認します。
確認できない場合は、そのGoモジュール更新を停止するか、取得経路を管理できる実行基盤へ移します。公開proxyへのフォールバックは追加しません。

## GitHub側の切り替え

2026-10-18にmainのrulesetから`dependabot-auto-merge`だけを除外済みです。
個別CI8項目、最新mainへの追従、空のbypass listを維持しています。
GitHubのDependabot security updatesは停止済みで、alertsは有効のままです。
Renovateの`vulnerabilityAlerts.enabled`は既存mainでもtrueなので、セキュリティ修正PRの作成担当は切り替え済みです。
DependabotのOPEN PRは確認時点で0件で、重複PRの整理対象はありませんでした。

残る手順はユーザーがブラウザでこのPRをマージすることです。
マージによってDependabotの通常更新設定・専用自動マージworkflowが削除され、Renovateの通常・脆弱性修正の自動マージが有効になります。
初週は通常マージ時刻、失敗・保留PR、本番公開の結果を確認します。問題時はRenovateの自動マージを停止します。

切り戻しは旧Dependabot設定・workflowとGitHubのsecurity updatesを復元し、必要な必須チェックを戻します。
alertsを停止したり、検証用に既知の脆弱性をmainへ追加したりはしません。

## 公式仕様

- [脆弱性アラート修正に必要な権限](https://docs.renovatebot.com/security-and-permissions/)
- [Mendプラン別の環境変数設定範囲](https://docs.renovatebot.com/mend-hosted/environment-variables/)
- [Mendの実行キューとスケジューラー](https://docs.renovatebot.com/mend-hosted/job-scheduling/)
