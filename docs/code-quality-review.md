# コード品質点検（2026-10-12）

## 対象と方法

Git管理下のGo・TypeScript・JavaScript・Astroファイル286件を対象に、HTML生成、ログ出力、script要素、テストの配置と命名を横断検索した。該当箇所の呼び出し元と、計算層・表示層・API・既存テストを確認した。生成物、依存パッケージ、画像・データは設計点検の対象外。全行の手動レビューや、命名の機械的な完全証明を意味するものではない。

## 結果

| 指摘 | 確認結果と対応 |
| --- | --- |
| Model層でHTML生成 | 計算エンジンのdomain・usecase・fare層にHTML生成は見つからなかった。計算結果は構造体・文字列配列として返し、React・Astroが表示を担う。Astroの `set:html` は表示層のJSON-LD出力。現構成はAstro・React・Goで、MVCを前提としたPHPアプリではない。 |
| デバッグコードの本番混入 | PHPおよび `error_log` は存在しない。乗車券の通常計算でカナコードを `fmt.Printf` で出力する動作は仕様として維持する（2026-10-13確認）。この出力をデバッグ混入として扱った変更は取り消した。PWAの `console.debug` 3箇所も削除した。 |
| 500行超のインラインJavaScript | Astroのscript本文を計測し、最大はHeaderの109行。これはAstroが処理するバンドル対象。500行超のscriptは見つからなかった。500行超のTSX・Goファイルは存在するが、この指摘とは別の保守性検討事項。 |
| テストが存在しない | Goのテストファイル75件、Nodeのテストファイル4件、ブラウザのテストファイル9件が存在する。CIでも実行する設定。カナコードの標準出力を検証する既存テストも維持した。全機能の網羅率は測定していない。 |
| 既存と異なる命名 | 周辺コードと比較し、修正を要する明確な逸脱は見つからなかった。TypeScriptのcamelCase・コンポーネントのPascalCase、Goの公開識別子と非公開識別子の区別を確認した。今回も既存の関数名を維持した。 |

APIの構造化アクセスログ、エラーログ、ビルド・事前計算コマンドの進捗ログは用途があるため維持した。ESLintに `src` 内の `console.log`・`console.debug` 等と `debugger` の禁止を追加し、`console.warn`・`console.error` は許可する。

## ローカル検証

- `npm run lint`: 成功。
- `npm run typecheck`: 77ファイル、エラー・警告・ヒント0件。
- `npm run test:worker`: 38テスト成功。
- `GOCACHE=/private/tmp/kippu-navi-go-cache go test -race ./...`: 全対象パッケージ成功。
- `npm run test:e2e -- tests/browser/pwa.spec.ts`: ビルドとPWAの7テスト成功。オフライン計算・API障害時の切り替えを含む。

今回の変更に対するCI・本番デプロイ・実機確認は未実施。
