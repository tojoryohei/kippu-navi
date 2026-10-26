# CSPの生成と配信

`npm run build` はAstroビルド・Cloudflare資材パッケージ・Sentry Debug ID注入の後、`scripts/build-csp.mjs`、`scripts/build-pwa.mjs` の順で実行する。

Astro標準CSPはClientRouterと併用できないため有効化しない。HTMLをparse5で解析し、404・サブディレクトリ・template内を含む全HTMLの実行可能なインラインスクリプトをSHA-256でハッシュ化する。JSON-LDなどのデータブロックとsrc付きスクリプトは対象外。重複排除・ソートした集合を`dist/_headers`の`/*`ルールに一度だけ記述する。画面遷移前後で同じビルドの許可集合が使われる。ハッシュはブラウザのHTML解析と同じ改行正規化後のテキストから生成する。

CSSはAstroの`inlineStylesheets: "never"`に加えて、生成HTMLに残るstyle要素とstyle属性を内容ハッシュ付き外部CSSへ移す。駅・路線・分割回数の選択は共通のChoiceSelectとStationSelectを使用し、globals.cssで描画する。react-select・Emotion・NonceProviderは使用しない。仮想スクロールの位置・高さはrefからDOMのstyle.height・style.transformプロパティを更新し、SSRのstyle属性やCSS文字列の注入には依存しない。

JavaScriptにはunsafe-inline・unsafe-eval・nonceを使用しない。WASMに必要なwasm-unsafe-evalだけを許可する。script-src-attrとstyle-src-attrはnone、style-srcはself。CSP metaやイベントハンドラー属性、nonceが生成HTMLにあればビルドを失敗させる。既存CSPヘッダーは生成時に除去し、全ヘッダー行のUTF-8長をインデントとヘッダー名込みで2,000バイト以下に制限する（Cloudflareの2,000文字制限より保守的）。ハッシュ数が増えて超過した場合はスクリプトを外部化し、ポリシーを緩和しない。

PWAの整合性ハッシュはHTMLとCSSの変更後に計算する。HTMLとヘッダーは同じビルドの資材として一緒にデプロイする。`scripts/preview-pwa.mjs`も生成CSPを配信するため、PlaywrightでCSP違反とClientRouter遷移を検証できる。

参照:
- [Astro CSPとClientRouterの制約](https://docs.astro.build/en/reference/configuration-reference/#securitycsp)
- [CSP Level 3](https://www.w3.org/TR/CSP3/#script-src)
- [Cloudflare _headersの仕様](https://developers.cloudflare.com/workers/static-assets/headers/)
