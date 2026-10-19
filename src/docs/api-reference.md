# きっぷナビ 公開APIの使い方

きっぷナビは、乗車券・定期券・IC定期券の分割候補を検索するGET APIを公開しています。認証・APIキー・利用登録は不要です。サーバーや、HTTP取得が可能なAIツールから利用できます。ブラウザから別オリジンで呼ぶ場合のCORS対応は保証していません。

- [OpenAPI 3.1仕様](https://kippu-navi.com/openapi.json)
- [正式駅名一覧（JSON）](https://kippu-navi.com/developers/stations.json)
- [この説明のMarkdown版](https://kippu-navi.com/developers/api.md)
- [AI向け案内](https://kippu-navi.com/llms.txt)

## APIが返すもの

応答は分割境界となる駅名の候補です。金額・節約額・全経由駅・時刻表・購入手続きは含みません。金額を知りたい場合は、[計算画面](https://kippu-navi.com/split/auto/ticket)で確認してください。回答に金額を推測して付け足さないでください。

以下は応答形式の説明用の例で、実際の計算結果ではありません。

```json
{"normal":["東京","横浜"],"results":[["東京","蒲田","横浜"]]}
```

`normal`は指定した発駅と着駅です。`results`の各配列は、発駅・分割境界駅・着駅の順に並ぶ1つの候補です。上の例は東京→蒲田と蒲田→横浜に分割する1つの候補を表します。`["東京","横浜"]`なら分割なしの候補です。候補が複数あれば、それぞれ独立した候補として示してください。

## 駅名は完全一致が必要です

`from`・`to`・`noSplitStation`には、[正式駅名一覧](https://kippu-navi.com/developers/stations.json)の`name`をそのまま使ってください。APIは曖昧検索や駅名の表記補正をしません。全角・半角、括弧、英字や仮名の大小も区別します。`from`・`to`の前後に空白を付けないでください。`noSplitStation`の前後の空白・空値・重複の扱いは後述します。

- 中央線の大久保駅は`（中）大久保`です。`大久保`や`(中)大久保`では一致しません。
- 大久保駅には`（中）大久保`・`（陽）大久保`・`（奥）大久保`があります。路線・地域が不明なら利用者に確認してください。
- `ＪＲ総持寺`の英字は全角大文字です。`JR総持寺`とは異なります。
- `姉ケ崎`は大きい`ケ`です。`姉ヶ崎`では一致しません。

一覧は分割検索画面と共通の駅データから生成します。`name`がAPIへ渡す正式駅名、`kana`が読みです。同名駅には`おおくぼ（東京都）`のような地域の補足があるので、識別に使ってください。`icPassAreaName`はIC定期券エリアの補助情報で、未設定の場合は`null`です。掲載は全券種・全区間で計算できることを保証するものではありません。区間・券種によっては経路不成立になります。数値の駅IDや推測した別名を送らないでください。

## エンドポイントとパラメーター

ベースURLは`https://kippu-navi.com`、メソッドはすべて`GET`です。

- `/api/split/auto/ticket`：乗車券。`from`・`to`が必須です。
- `/api/split/auto/pass`：定期券。`from`・`to`・`months`が必須です。
- `/api/split/auto/ic-pass`：IC定期券。`from`・`to`・`months`が必須です。

`months`は定期券の有効期間（月）で、`1`・`3`・`6`のいずれかを指定します。

乗車券・定期券には任意の`maxSplits`（0〜10）を指定できます。これは分割回数で、`1`なら最大2区間です。省略または`0`は無制限です。IC定期券は最大2区間（1分割）に固定され、`maxSplits`を送っても無視されます。

任意の`noSplitStation`は分割境界にしない駅です。複数指定する場合は`noSplitStation=駅名1&noSplitStation=駅名2`のようにキーを繰り返します。公開APIでは値の前後の空白を除去し、空値と重複を取り除いてから計算します。駅名そのものは正式表記で指定してください。

## 呼び出し例

日本語や括弧はURLエンコードしてください。curlの`--data-urlencode`、JavaScriptの`URLSearchParams`が利用できます。

```sh
curl --get 'https://kippu-navi.com/api/split/auto/ticket' \
  --data-urlencode 'from=東京' --data-urlencode 'to=横浜'

curl --get 'https://kippu-navi.com/api/split/auto/pass' \
  --data-urlencode 'from=東京' --data-urlencode 'to=横浜' \
  --data-urlencode 'months=3'

curl --get 'https://kippu-navi.com/api/split/auto/ic-pass' \
  --data-urlencode 'from=東京' --data-urlencode 'to=横浜' \
  --data-urlencode 'months=6'
```

サーバー側JavaScriptでの例です。

```js
const query = new URLSearchParams({ from: '東京', to: '横浜' });
const url = `https://kippu-navi.com/api/split/auto/ticket?${query}`;
const response = await fetch(url);
if (!response.ok) throw new Error(`APIエラー: ${response.status}`);
const result = await response.json();
console.log(result.results);
```

## エラー・利用上の注意

- `400`：必須項目不足、不正な期間、存在しない駅名、同一の発着駅など。入力を直してください。
- `405`：GET以外のメソッドです。
- `422`：指定条件で経路が成立しないなどの計算条件エラーです。
- `429`：Cloudflareのレートリミットです。`Retry-After`があれば従い、時間を空けてください。
- `500`・`502`・`503`：計算処理や転送の失敗、一時的な利用不可です。

アプリケーションのエラーは通常`{"error":"説明"}`ですが、CloudflareやプロキシのエラーはHTMLやテキストの場合もあります。HTTPステータスとContent-Typeを確認し、エラーを計算結果として扱わないでください。連続再試行や大量アクセスは避けてください。応答はキャッシュされる場合があり、可用性や即時更新を保証しません。

## チャットAIから利用する手順

1. この説明と正式駅名一覧を取得してください。ツールにHTTP取得機能がなければ、呼び出したと装わず利用者へAPIリンク・計算画面を案内してください。
2. 利用者が示した路線・地域と、一覧の`kana`に含まれる地域の補足を手がかりに、正式駅名に対応付けてください。例えば「中央線の大久保」は`（中）大久保`です。同名駅が複数あって絞れない場合は質問してください。Unicode正規化などで一覧の正式駅名を書き換えないでください。
3. 券種と定期期間を確認し、APIをGETで呼んでください。未指定の任意条件を推測して追加しないでください。
4. 成功応答に含まれる分割駅だけを説明し、参照したAPI URLと、金額を確認できる計算画面へのリンクを添えてください。

## 計算画面へのリンク

画面のパスは乗車券が`/split/auto/ticket`、定期券が`/split/auto/pass`、IC定期券が`/split/auto/ic-pass`です。`from`・`to`と、指定した`maxSplits`・`noSplitStation`を引き継いでください。

定期期間は画面URLもAPIも`months`です。例えばAPIに`months=3`を指定した場合、画面にも`months=3`を付けます。

- [乗車券の計算画面](https://kippu-navi.com/split/auto/ticket?from=東京&to=横浜)
- [定期券3箇月の計算画面](https://kippu-navi.com/split/auto/pass?from=東京&to=横浜&months=3)
- [IC定期券6箇月の計算画面](https://kippu-navi.com/split/auto/ic-pass?from=東京&to=横浜&months=6)

## チャットAIへの依頼例

例えばチャットAIには次のように依頼できます。

> https://kippu-navi.com/developers/api.md を読み、正式駅名を確認して、東京から横浜の乗車券の分割候補をAPIで調べてください。実際の応答に基づいて答え、金額は推測しないでください。

文書の公開は、すべてのAIが自動的にAPIを認知・実行することを保証しません。利用するAIの検索・HTTP取得機能によって使い方が異なります。
