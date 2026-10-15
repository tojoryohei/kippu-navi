import { test, expect } from "@playwright/test";

test("公開文書の呼び出し例を実APIで利用できる", async ({ request }) => {
  for (const kind of ["ticket", "pass", "icpass"]) {
    const query = new URLSearchParams({ from: "茂原", to: "新茂原" });
    if (kind !== "ticket") query.set("months", kind === "pass" ? "3" : "6");
    const response = await request.get(`/api/split-${kind}?${query}`);
    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({ normal: ["茂原", "新茂原"], results: [["茂原", "新茂原"]] });
  }
  for (const from of ["大久保", "(中)大久保", "JR総持寺", "姉ヶ崎"]) {
    const response = await request.get(`/api/split-ticket?${new URLSearchParams({ from, to: "新宿" })}`);
    expect(response.status()).toBe(400);
  }
  for (const [from, to] of [["（中）大久保", "新宿"], ["ＪＲ総持寺", "茨木"], ["姉ケ崎", "五井"]]) {
    const response = await request.get(`/api/split-ticket?${new URLSearchParams({ from, to })}`);
    expect(response.status()).toBe(200);
    expect((await response.json()).normal).toEqual([from, to]);
  }
  const restricted = await request.get(`/api/split-ticket?${new URLSearchParams({ from: "茂原", to: "新茂原", maxSplits: "1", noSplitStation: "茂原" })}`);
  expect(restricted.status()).toBe(200);
  const invalid = await request.get("/api/split-pass?from=茂原&to=新茂原&months=2");
  expect(invalid.status()).toBe(400);
  const wrongPeriodKey = await request.get("/api/split-pass?from=茂原&to=新茂原&month=3");
  expect(wrongPeriodKey.status()).toBe(400);
});

test("文書の計算画面リンクからAPIへ正しい定期期間を渡す", async ({ page }) => {
  await page.route("**/*", route => ["localhost", "127.0.0.1"].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
  for (const [label, endpoint, months] of [
    ["定期券3箇月の計算画面", "split-pass", "3"],
    ["IC定期券6箇月の計算画面", "split-icpass", "6"],
  ]) {
    await page.goto("/developers/api");
    const href = await page.getByRole("link", { name: label, exact: true }).getAttribute("href");
    expect(href).toBeTruthy();
    const url = new URL(href!);
    expect(url.searchParams.get("months")).toBe(months);
    expect(url.searchParams.has("month")).toBe(false);
    const apiResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/${endpoint}`);
    await page.goto(`${url.pathname}${url.search}`);
    const response = await apiResponse;
    expect(response.status()).toBe(200);
    expect(new URL(response.url()).searchParams.get("months")).toBe(months);
    await expect(page.getByRole("heading", { name: "計算結果", exact: true })).toBeVisible();
  }
});
