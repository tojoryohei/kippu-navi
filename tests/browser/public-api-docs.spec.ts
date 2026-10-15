import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import stationData from "@/app/split/data/stationDatas.json" with { type: "json" };

test("API文書・仕様・駅名一覧を取得できる", async ({ request, page }) => {
  const response = await request.get("/developers/api");
  expect(response.status()).toBe(200);
  const html = await response.text();
  expect(html).toContain('rel="canonical" href="https://kippu-navi.com/developers/api"');
  const deployment = await (await request.get('/deployment.json')).json();
  if (deployment.environment === 'staging') {
    expect(html).toContain('name="robots" content="noindex, nofollow"');
  } else {
    expect(html).not.toContain('name="robots" content="noindex, nofollow"');
  }
  const markdown = await request.get("/developers/api.md");
  expect(markdown.status()).toBe(200);
  expect(markdown.headers()["content-type"]).toContain("text/markdown");
  const text = await markdown.text();
  for (const phrase of ["金額・節約額・全経由駅", "（中）大久保", "ＪＲ総持寺", "姉ケ崎", "maxSplits"]) {
    expect(text).toContain(phrase);
    expect(html).toContain(phrase);
  }
  await page.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  await page.goto("/developers/api");
  await expect(page.getByRole("heading", { level: 1, name: "きっぷナビ 公開APIの使い方" })).toBeVisible();
  await expect(page.getByRole("link", { name: "OpenAPI 3.1仕様" })).toHaveAttribute("href", "https://kippu-navi.com/openapi.json");

  const specResponse = await request.get("/openapi.json");
  expect(specResponse.status()).toBe(200);
  expect(specResponse.headers()["content-type"]).toContain("application/json");
  const spec = await specResponse.json();
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.security).toEqual([]);
  expect(spec.servers).toEqual([{ url: "https://kippu-navi.com" }]);
  expect(Object.keys(spec.paths).sort()).toEqual(["/api/split-icpass", "/api/split-pass", "/api/split-ticket", "/developers/stations.json"]);
  const ids = new Set<string>();
  for (const [path, value] of Object.entries(spec.paths)) {
    const operation = (value as { get: { operationId: string; parameters: { name: string; required?: boolean; schema: unknown }[]; responses: Record<string, unknown> } }).get;
    ids.add(operation.operationId);
    if (path === "/developers/stations.json") continue;
    expect(operation.parameters.filter(p => p.required).map(p => p.name)).toEqual(path === "/api/split-ticket" ? ["from", "to"] : ["from", "to", "months"]);
    expect(operation.parameters.some(p => p.name === "maxSplits")).toBe(path !== "/api/split-icpass");
    expect(operation.responses).toHaveProperty("429");
  }
  expect(ids.size).toBe(4);

  const catalogResponse = await request.get("/developers/stations.json");
  expect(catalogResponse.status()).toBe(200);
  const catalog = await catalogResponse.json();
  const names = catalog.stations.map((station: { name: string }) => station.name);
  const sourceNames = new Set(stationData.map(station => station.name));
  expect(new Set(names)).toEqual(sourceNames);
  expect(names.length).toBe(sourceNames.size);
  for (const name of ["（中）大久保", "（陽）大久保", "（奥）大久保", "ＪＲ総持寺", "姉ケ崎"]) {
    const station = catalog.stations.find((station: { name: string }) => station.name === name);
    expect(station).toBeTruthy();
    expect(station.kana.length).toBeGreaterThan(0);
  }
  expect(catalog.stations).toEqual(stationData);
  for (const name of ["大久保", "(中)大久保", "JR総持寺", "姉ヶ崎"]) expect(names).not.toContain(name);
});

test("AIが文書と公開APIを発見できる", async ({ request }) => {
  // ローカルpreviewはCloudflareの_headersを解釈しないため、配信用成果物も検査する。
  const headers = readFileSync("dist/_headers", "utf8");
  const deployment = await (await request.get('/deployment.json')).json();
  const staging = deployment.environment === 'staging';
  if (staging) {
    expect(headers).toContain('X-Robots-Tag: noindex, nofollow');
    expect(headers).not.toContain('  Link:');
  } else {
    expect(headers).toContain('</openapi.json>; rel="service-desc"');
    expect(headers).toContain('</llms.txt>; rel="describedby"');
    expect(headers).toContain('</developers/api.md>; rel="alternate"; type="text/markdown"');
  }
  const response = await request.get("/llms.txt");
  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toContain("text/plain");
  const text = await response.text();
  if (staging) {
    expect(text).toContain('このホストはstagingの検証環境');
    expect(text).toContain('https://kippu-navi.com/developers/api');
    expect(text).not.toContain('/openapi.json');
  } else {
    for (const path of ["/developers/api.md", "/openapi.json", "/developers/stations.json"]) expect(text).toContain(`https://kippu-navi.com${path}`);
  }
  const robots = await (await request.get("/robots.txt")).text();
  if (staging) {
    expect(robots).toBe('User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n');
  } else {
    expect(robots).toContain("Disallow: /api/");
    for (const path of ["split-ticket", "split-pass", "split-icpass"]) expect(robots).toContain(`Allow: /api/${path}\n`);
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>https://kippu-navi.com/developers/api</loc>");
});
