import stationData from "@/app/split/data/stationDatas.json";

export const stationCatalog = {
  description: "分割検索画面と共通の正式駅名一覧。nameをそのまま送信してください。掲載は全券種・全区間の計算成立を保証しません。",
  stations: stationData,
};

const stationParameter = (name: string, description: string) => ({
  name, in: "query", required: true,
  description: `${description}。/developers/stations.jsonのnameと完全一致。全角・半角、括弧、仮名の大小も区別します。`,
  schema: { type: "string", minLength: 1 },
});
const maxSplits = {
  name: "maxSplits", in: "query", required: false,
  description: "最大分割回数。省略または0は無制限。1なら最大2区間。",
  schema: { type: "integer", minimum: 0, maximum: 10, default: 0 },
};
const noSplitStation = {
  name: "noSplitStation", in: "query", required: false,
  description: "分割境界にしない駅の正式駅名。複数指定は同じキーを繰り返します。前後の空白・空値・重複を除去した後、駅名は一覧と完全一致。",
  style: "form", explode: true,
  schema: { type: "array", items: { type: "string", minLength: 1 } },
};
const months = {
  name: "months", in: "query", required: true,
  description: "定期券の有効期間（月）。1・3・6のいずれかを指定します。",
  schema: { type: "integer", enum: [1, 3, 6] },
};
const jsonError = (description: string) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
});
const operation = (operationId: string, summary: string, pass: boolean, ic: boolean) => ({
  operationId, summary,
  description: `${ic ? "IC定期券は最大2区間（1分割）で固定。maxSplitsを送っても無視されます。" : ""}分割境界の駅名を返します。金額・節約額・全経由駅は返しません。`,
  parameters: [stationParameter("from", "出発駅"), stationParameter("to", "到着駅"),
    ...(pass ? [months] : []), ...(ic ? [] : [maxSplits]), noSplitStation],
  responses: {
    "200": {
      description: "分割候補。results内の各配列は独立した候補です。例は形式の説明用で、実際の計算結果ではありません。",
      content: { "application/json": {
        schema: { $ref: "#/components/schemas/SplitResult" },
        example: { normal: ["東京", "横浜"], results: [["東京", "蒲田", "横浜"]] },
      } },
    },
    "400": jsonError("入力不備・存在しない駅名など。"),
    "405": { ...jsonError("GET以外は利用できません。"), headers: { Allow: { schema: { type: "string" } } } },
    "422": jsonError("経路が成立しないなどの計算条件エラー。"),
    "429": { description: "Cloudflareの利用制限。JSONとは限りません。Retry-Afterがあれば従い、連続再試行を避けてください。" },
    "500": jsonError("計算処理の内部エラー。"),
    "502": { description: "APIへの転送失敗。JSONとは限りません。" },
    "503": { description: "一時的に利用できません。JSONとは限りません。" },
  },
});

export const openapi = {
  openapi: "3.1.0",
  info: {
    title: "きっぷナビ 公開分割検索API", version: "1.0.0",
    description: "認証・APIキー不要の既存GET API。金額は返しません。駅名は正式駅名一覧から選んでください。",
  },
  servers: [{ url: "https://kippu-navi.com" }], security: [],
  externalDocs: { url: "https://kippu-navi.com/developers/api", description: "利用方法・駅名・AI向け手順" },
  paths: {
    "/api/split-ticket": { get: operation("searchSplitTicket", "乗車券の分割検索", false, false) },
    "/api/split-pass": { get: operation("searchSplitPass", "定期券の分割検索", true, false) },
    "/api/split-icpass": { get: operation("searchSplitIcPass", "IC定期券の分割検索", true, true) },
    "/developers/stations.json": { get: {
      operationId: "listStations", summary: "正式駅名と読みの一覧を取得",
      description: "一覧のnameをそのまま分割検索へ渡してください。kanaには読みや地域の補足があります。同名駅が曖昧なら利用者に確認してください。駅名を正規化して書き換えないでください。",
      responses: { "200": {
        description: "分割検索画面と共通の駅データから生成した一覧。掲載は全券種・全区間の計算成立を保証しません。",
        content: { "application/json": { schema: {
          type: "object", required: ["description", "stations"],
          properties: {
            description: { type: "string" },
            stations: { type: "array", items: {
              type: "object", required: ["name", "kana", "icPassAreaName"],
              properties: {
                name: { type: "string" },
                kana: { type: "string", description: "読み。同名駅には地域などの補足を含む場合があります。" },
                icPassAreaName: { type: ["string", "null"], description: "IC定期券エリアの補助情報。エリア内の全区間での計算成立を保証するものではありません。" },
              },
            } },
          },
        } } },
      } },
    } },
  },
  components: { schemas: {
    SplitResult: {
      type: "object", required: ["normal", "results"],
      properties: {
        normal: { type: "array", minItems: 2, maxItems: 2, items: { type: "string" }, description: "指定した発着駅。全経由駅ではありません。" },
        results: { type: "array", items: { type: "array", minItems: 2, items: { type: "string" } }, description: "発駅・分割境界駅・着駅の順。各配列が1つの候補。" },
      },
    },
    Error: { type: "object", required: ["error"], properties: { error: { type: "string" } } },
  } },
};
