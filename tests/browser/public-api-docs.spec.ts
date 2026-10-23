import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";

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
  for (const phrase of ["（中）大久保", "ＪＲ総持寺", "姉ケ崎", "maxSplits"]) {
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
  expect(Object.keys(spec.paths).sort()).toEqual(["/api/split/auto/ic-pass", "/api/split/auto/pass", "/api/split/auto/ticket", "/developers/stations.json"]);
  const apiCatalogResponse = await request.get("/.well-known/api-catalog");
  expect(apiCatalogResponse.status()).toBe(200);
  const apiCatalog = await apiCatalogResponse.json();
  const catalogUrl = "https://kippu-navi.com/.well-known/api-catalog";
  const endpoints = Object.keys(spec.paths).map(path => `https://kippu-navi.com${path}`);
  expect(apiCatalog.linkset).toEqual([
    { anchor: catalogUrl, item: endpoints.map(href => ({ href })) },
    ...endpoints.map(anchor => ({
      anchor,
      "service-desc": [{ href: "https://kippu-navi.com/openapi.json", type: "application/json" }],
      "service-doc": [{ href: "https://kippu-navi.com/developers/api", type: "text/html" }],
    })),
  ]);
  expect((await request.head("/.well-known/api-catalog")).status()).toBe(200);
  // 拡張子のない静的資材のContent-TypeとHEADのLinkはCloudflareが付与する。
  expect(readFileSync("dist/_headers", "utf8")).toContain(
    '/.well-known/api-catalog\n  Content-Type: application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
  );
  const ids = new Set<string>();
  for (const [path, value] of Object.entries(spec.paths)) {
    const operation = (value as { get: { operationId: string; parameters: { name: string; required?: boolean; schema: unknown }[]; responses: Record<string, unknown> } }).get;
    ids.add(operation.operationId);
    if (path === "/developers/stations.json") continue;
    expect(operation.parameters.filter(p => p.required).map(p => p.name)).toEqual(path === "/api/split/auto/ticket" ? ["from", "to"] : ["from", "to", "months"]);
    expect(operation.parameters.some(p => p.name === "maxSplits")).toBe(path !== "/api/split/auto/ic-pass");
    expect(operation.responses).toHaveProperty("429");
  }
  expect(ids.size).toBe(4);

  const catalogResponse = await request.get("/developers/stations.json");
  expect(catalogResponse.status()).toBe(200);
  const catalog = await catalogResponse.json();
  const names = catalog.stations.map((station: { name: string }) => station.name);
  expect(new Set(names).size).toBe(names.length);
  for (const name of ["（中）大久保", "（陽）大久保", "（奥）大久保", "ＪＲ総持寺", "姉ケ崎"]) {
    const station = catalog.stations.find((station: { name: string }) => station.name === name);
    expect(station).toBeTruthy();
    expect(station.kana.length).toBeGreaterThan(0);
  }
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
    expect(headers).toContain('</.well-known/api-catalog>; rel="api-catalog"');
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
    expect(robots).toBe("User-agent: *\nContent-Signal: ai-train=no, search=yes, ai-input=yes\nDisallow:\n\nSitemap: https://kippu-navi.com/sitemap.xml\n");
  }
  const sitemap = await (await request.get("/sitemap.xml")).text();
  expect(sitemap).toContain("<loc>https://kippu-navi.com/developers/api</loc>");
});

test('ビルドした各ページのMarkdownをWorkerが内容交渉で配信する', async ({ request }) => {
  const { default: frontend } = await import('../../workers/frontend.mjs');
  const assets = { fetch: async (incoming: Request) => {
    const url = new URL(incoming.url);
    const result = await request.fetch(`${url.pathname}${url.search}`, {
      method: incoming.method, headers: Object.fromEntries(incoming.headers),
    });
    return new Response(incoming.method === 'HEAD' ? null : new Uint8Array(await result.body()).buffer, {
      status: result.status(), headers: result.headers(),
    });
  } };
  for (const [path, phrase] of [
    ['/', '# きっぷナビへようこそ'],
    ['/articles/split-ticket-case-study', '# 分割乗車券で安くなる場合・ならない場合を実際に計算する'],
    ['/split/auto/ticket', '分割'],
    ['/developers/api', '# きっぷナビ 公開APIの使い方'],
  ]) {
    const url = `https://kippu-navi.com${path}`;
    const markdown = await frontend.fetch(new Request(url, { headers: { Accept: 'text/markdown' } }), {
      ASSETS: assets, DEPLOY_ENVIRONMENT: 'production',
    });
    expect(markdown.status).toBe(200);
    expect(markdown.headers.get('Content-Type')).toContain('text/markdown');
    expect(markdown.headers.get('Vary')).toContain('Accept');
    const text = await markdown.text();
    expect(text).toContain(phrase);
    expect(text).not.toMatch(/<(script|style|nav|form)\b/i);
    expect(text).not.toContain('astro-island');
    if (path.includes('case-study')) {
      expect(text).toContain('| 乗車券の区間 |');
      expect(text).toContain('https://kippu-navi.com/');
    }
    const html = await frontend.fetch(new Request(url), { ASSETS: assets, DEPLOY_ENVIRONMENT: 'production' });
    expect(html.headers.get('Content-Type')).toContain('text/html');
    expect(await html.text()).toContain('<!DOCTYPE html>');
  }
});
