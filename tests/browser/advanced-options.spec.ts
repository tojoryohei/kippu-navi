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
  await page.goto("/split/ticket?noSplitStation=東京&maxSplits=2");
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
  const search = page.getByLabel("分割しない駅", { exact: true });
  await search.fill("しんじゅく");
  await search.press("ArrowDown");
  await search.press("Enter");
  await expect(search).toHaveValue("");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(2);
  await page.getByRole("button", { name: "新宿を分割しない駅から削除", exact: true }).click();
  await expect(search).toBeFocused();
  await page.getByRole("button", { name: "東京を分割しない駅から削除", exact: true }).click();
  await expect(search).toBeFocused();
  await expect(page.getByText("分割しない駅は設定されていません。")).toBeVisible();
});

test("券種切り替え・URL復元・計算要求の設定を維持", async ({ page }) => {
  await page.goto("/split/ticket?from=新茂原&to=茂原&noSplitStation=東京&maxSplits=2");
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
  await expect(page).toHaveURL(/\/split\/pass\?/);
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("3回");
  await page.locator("form summary").click();
  await expect(page.locator(".split-options-search .station-select__control").last()).toHaveCSS("min-height", "38px");
  await expect(page.locator(".split-count-select .station-select__control")).toHaveCSS("height", "38px");
  await expect(page.getByLabel("最大分割数", { exact: true })).toHaveCSS("opacity", "0");
  await page.getByLabel("分割しない駅", { exact: true }).fill("品川");
  await expect(page.locator(".split-options-search .station-select__option").first()).toBeVisible();
  await page.getByLabel("分割しない駅", { exact: true }).fill("");
  await page.locator("form summary").click();
  await page.getByRole("button", { name: "IC定期券", exact: true }).click();
  await page.locator("form summary").click();
  await expect(page.getByLabel("最大分割数", { exact: true })).toHaveCount(0);
  await expect(page.getByText("1回（固定）", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "乗車券", exact: true }).click();
  await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("1回");
});

for (const width of [320, 390, 1280]) {
  test(`駅の全件表示・入力欄の統一 ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/split/ticket");
    await page.locator("form summary").click();
    const list = page.getByRole("list", { name: "分割しない駅の一覧" });
    await expect(list.locator("li")).toHaveCount(10);
    await expect(page.getByRole("button", { name: /残り\d+駅を表示|一部を隠す/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "鹿島サッカースタジアムを分割しない駅から削除" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const controls = page.locator(".split-options-search .station-select__control");
    await expect(controls).toHaveCount(2);
    await expect(controls.first()).toHaveCSS("height", "38px");
    await expect(page.getByLabel("最大分割数", { exact: true })).toHaveCSS("position", "absolute");
    await expect(page.getByLabel("最大分割数", { exact: true })).toHaveCSS("opacity", "0");
    await expect(page.getByLabel("最大分割数", { exact: true })).toHaveCSS("caret-color", "rgba(0, 0, 0, 0)");
    const stationStyle = await page.locator(".station-select__control").first().evaluate(element => {
      const style = getComputedStyle(element);
      return { height: style.minHeight, radius: style.borderRadius, fontSize: style.fontSize, border: style.borderColor };
    });
    for (const control of await controls.all()) {
      await expect(control).toHaveCSS("min-height", stationStyle.height);
      await expect(control).toHaveCSS("border-radius", stationStyle.radius);
      await expect(control).toHaveCSS("font-size", stationStyle.fontSize);
      await expect(control).toHaveCSS("border-color", stationStyle.border);
    }
    await expect(page.locator("form details select")).toHaveCount(0);
    await expect(page.locator(".split-options-search .station-select__indicator, .split-options-search .station-select__indicator-separator")).toHaveCount(0);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath(`advanced-options-${width}.png`), fullPage: true });
    await controls.first().click();
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.getByRole("option", { name: "10回", exact: true }).click();
    await expect(page.locator(".split-count-select .station-select__single-value")).toHaveText("10回");
  });
}

test("発着駅を一覧と検索候補から除外", async ({ page }) => {
  await page.goto("/split/ticket?from=新茂原&to=茂原&noSplitStation=新茂原&noSplitStation=東京");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(1);
  await page.locator("form summary").click();
  await expect(page.getByRole("button", { name: "新茂原を分割しない駅から削除" })).toHaveCount(0);
  const search = page.getByLabel("分割しない駅", { exact: true });
  await search.fill("新茂原");
  await expect(page.locator(".split-options-search").getByText("該当する駅がありません")).toBeVisible();
  await search.fill("東京");
  await expect(page.locator(".split-options-search .station-select__option").filter({ hasText: /^とうきょう東京$/ })).toHaveCount(0);
  await page.getByRole("combobox").first().fill("新宿");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(2);
  await expect(page.getByRole("button", { name: "新茂原を分割しない駅から削除" })).toBeVisible();
});
