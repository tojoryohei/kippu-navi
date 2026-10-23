import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", route => {
    const url = new URL(route.request().url());
    if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
    if (url.pathname.startsWith("/ingest/")) return route.abort();
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { normal: ["新茂原", "茂原"], results: [["新茂原", "茂原"]] } });
    return route.continue();
  });
});

test("見出し・キーボード追加・削除・空表示", async ({ page }) => {
  await page.goto("/split/auto/ticket?noSplitStation=東京&maxSplits=2");
  const details = page.locator("form details");
  await expect(details.locator("summary")).toHaveText("詳細オプション");
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("2回");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(1);
  await expect(details).not.toHaveAttribute("open", "");
  await details.locator("summary").focus();
  await page.keyboard.press("Enter");
  const splitCount = page.getByLabel("最大分割数", { exact: true });
  await splitCount.focus();
  await splitCount.press("ArrowDown");
  await splitCount.press("ArrowDown");
  await splitCount.press("Enter");
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("3回");
  const search = page.getByLabel("分割禁止駅", { exact: true });
  await search.fill("しんじゅく");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(search).toHaveValue("");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(2);
  await page.getByRole("button", { name: "新宿を分割しない駅から削除", exact: true }).click();
  await expect(search).toBeFocused();
  await page.getByRole("button", { name: "東京を分割しない駅から削除", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "選択済み：0駅" })).toBeVisible();
  await expect(page.getByText("分割しない駅は設定されていません。", { exact: true })).toHaveCount(0);
});

test("券種切り替え・URL復元・計算要求の設定を維持", async ({ page }) => {
  await page.goto("/split/auto/ticket?from=新茂原&to=茂原&noSplitStation=東京&maxSplits=2");
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("2回");
  await page.locator("form summary").click();
  await page.locator(".split-options-search .station-select__control").first().click();
  await page.getByRole("option", { name: "3回", exact: true }).click();
  const request = page.waitForRequest(req => req.url().includes("/api/") && new URL(req.url()).searchParams.get("maxSplits") === "3");
  await page.getByRole("button", { name: "乗車券を計算", exact: true }).click();
  expect(new URL((await request).url()).searchParams.getAll("noSplitStation")).toEqual(["東京"]);
  await page.reload();
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("3回");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(1);
  await page.getByRole("button", { name: "定期券", exact: true }).click();
  await expect(page).toHaveURL(/\/split\/auto\/pass\?/);
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("3回");
  await page.locator("form summary").click();
  await page.getByLabel("分割禁止駅", { exact: true }).fill("品川");
  await expect(page.locator(".split-options-search .station-select__option").first()).toBeVisible();
  await page.getByLabel("分割禁止駅", { exact: true }).fill("");
  await page.locator("form summary").click();
  const icPassRequest = page.waitForRequest(req => req.url().includes("/api/split/auto/ic-pass"));
  await page.getByRole("button", { name: "IC定期券", exact: true }).click();
  expect(new URL((await icPassRequest).url()).searchParams.has("maxSplits")).toBe(false);
  await expect.poll(() => new URL(page.url()).searchParams.has("maxSplits")).toBe(false);
  await page.locator("form summary").click();
  await expect(page.getByLabel("最大分割数", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1回（固定）", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "乗車券", exact: true }).click();
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("制限なし");
  await expect.poll(() => new URL(page.url()).searchParams.has("maxSplits")).toBe(false);
});

test("未指定の分割しない駅をURLへ追加しない", async ({ page }) => {
  await page.goto("/split/auto/ticket?from=新茂原&to=茂原&maxSplits=2");
  await expect(page.getByText("計算結果", { exact: true })).toBeVisible();
  expect(new URL(page.url()).searchParams.getAll("noSplitStation")).toEqual([]);
});

test("無制限のmaxSplitsをURLとAPIリクエストから省略する", async ({ page }) => {
  const request = page.waitForRequest(req => req.url().includes("/api/split/auto/ticket"));
  await page.goto("/split/auto/ticket?from=新茂原&to=茂原&maxSplits=0");
  await expect(page.getByText("計算結果", { exact: true })).toBeVisible();

  const ticketQuery = new URL((await request).url()).searchParams;
  expect(ticketQuery.has("maxSplits")).toBe(false);
  expect(ticketQuery.has("months")).toBe(false);
  expect(new URL(page.url()).searchParams.has("maxSplits")).toBe(false);
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("制限なし");

  const passRequest = page.waitForRequest(req => req.url().includes("/api/split/auto/pass"));
  await page.getByRole("button", { name: "定期券", exact: true }).click();
  const passQuery = new URL((await passRequest).url()).searchParams;
  expect(passQuery.has("maxSplits")).toBe(false);
  expect(passQuery.get("months")).toBe("6");
  expect(new URL(page.url()).searchParams.has("maxSplits")).toBe(false);
});

for (const width of [320, 1280]) {
  test(`駅の全件表示・入力欄の統一 ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/split/auto/ticket");
    await page.locator("form summary").click();
    const list = page.getByRole("list", { name: "分割しない駅の一覧" });
    await expect(list.locator("li")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /残り\d+駅を表示|一部を隠す/ })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "選択済み：0駅" })).toBeVisible();
    await expect(page.getByText("分割しない駅は設定されていません。", { exact: true })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const controls = page.locator(".split-options-search .station-select__control");
    await expect(controls).toHaveCount(2);
    await page.evaluate(() => window.scrollTo(0, 0));
    await controls.first().click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("option", { name: "10回", exact: true }).click();
    await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("10回");
  });
}

test("発着駅を一覧と検索候補から除外", async ({ page }) => {
  await page.goto("/split/auto/ticket?from=新茂原&to=茂原&noSplitStation=新茂原&noSplitStation=東京");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(1);
  await page.locator("form summary").click();
  await expect(page.getByRole("button", { name: "新茂原を分割しない駅から削除" })).toHaveCount(0);
  const search = page.getByLabel("分割禁止駅", { exact: true });
  await search.fill("新茂原");
  await expect(page.locator(".split-options-search").getByText("該当する駅がありません")).toBeVisible();
  await search.fill("東京");
  await expect(page.locator(".split-options-search .station-select__option").filter({ hasText: /^とうきょう東京$/ })).toHaveCount(0);
  await page.getByRole("combobox").first().fill("新宿");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "新茂原を分割しない駅から削除" })).toBeVisible();
});

for (const [kind, query] of [["pass","months=1"],["ic-pass","months=6"],["pass","month=1"],["ic-pass","month=6&months=3"]] as const) {
 {
    test(`期間パラメーターをmonthsへ統一する: ${kind} ${query}`, async ({ page }) => {
      await page.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
      const endpoint = kind;
      await page.route(`**/api/split/auto/${endpoint}?**`, route => route.fulfill({
        status: 400, json: { error: "期間パラメーターの検証用応答" },
      }));
      const request = page.waitForRequest(req => new URL(req.url()).pathname === `/api/split/auto/${endpoint}`);
      await page.goto(`/split/auto/${kind}?from=茂原&to=新茂原&${query}`);
      const input = new URLSearchParams(query);
      const expected = input.get("months") ?? input.get("month");
      expect(new URL((await request).url()).searchParams.get("months")).toBe(expected);
      expect(new URL(page.url()).searchParams.get("months")).toBe(expected);
      expect(new URL(page.url()).searchParams.has("month")).toBe(false);
      await page.getByRole("button", { name: "乗車券", exact: true }).click();
      await expect.poll(() => new URL(page.url()).searchParams.has("months")).toBe(false);
    });
  }
}
