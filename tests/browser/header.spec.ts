import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
});

test("PCの順番・分割メニュー・リンク・キーボード操作", async ({ page }) => {
  await page.goto("/guide");
  const trigger = page.locator("[data-split-trigger]");
  const children = page.locator("#split-methods");
  await expect(page.locator("#site-menu > ul > li > a:visible")).toHaveText(["はじめての方へ", "運賃計算"]);
  await expect(page.locator("[data-split-trigger]")).toHaveText(/分割きっぷ/);
  await expect(page.getByRole("link", { name: "ホーム", exact: true })).toHaveCount(0);
  await expect(children).toBeHidden();
  const closedHeaderBox = await page.getByRole("banner").boundingBox();
  await trigger.click();
  await expect(children).toBeVisible();
  await expect(children.locator("a")).toHaveCount(2);
  const headerBox = await page.getByRole("banner").boundingBox();
  expect(headerBox).toEqual(closedHeaderBox);
  await trigger.click();
  await expect(children).toBeHidden();
  await trigger.click();
  await children.getByRole("link", { name: "経路入力検索", exact: true }).hover();
  await expect(children).toBeVisible();
  await page.locator("h1").click();
  await expect(children).toBeHidden();
  await trigger.focus();
  await page.keyboard.press("Enter");
  await expect(children).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(children.locator("a").first()).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(children).toBeHidden();
  await trigger.click();
  await children.getByRole("link", { name: "経路自動検索", exact: true }).click();
  await expect(page).toHaveURL("/split/auto/ticket");
});

test("スマホは子項目を常時表示し、遷移とサイズ変更でスクロールを戻す", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 750 });
  await page.goto("/articles/jr-fare-system");
  await expect(page.locator("astro-island")).toHaveCount(0);
  const open = () => page.getByRole("button", { name: "メニューバーを開く" }).click();
  await open();
  await expect(page.locator("#split-methods a")).toHaveCount(2);
  await expect(page.locator("#split-methods")).toBeVisible();
  await expect(page.locator("[data-split-trigger]")).toBeHidden();
  const parentBox = await page.locator("[data-split-group]").boundingBox();
  const childBox = await page.locator("#split-methods a").first().boundingBox();
  expect(childBox!.x).toBeGreaterThan(parentBox!.x);
  await page.locator('#split-methods a[href="/split/auto/ticket"]').click();
  await expect(page).toHaveURL("/split/auto/ticket");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await open();
  await page.locator('#split-methods a[href="/split/route/ticket"]').click();
  await expect(page).toHaveURL("/split/route/ticket");
  await open();
  const links = page.locator("#split-methods a");
  expect(await links.nth(0).evaluate(el => getComputedStyle(el).color)).toBe(
    await links.nth(1).evaluate(el => getComputedStyle(el).color),
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await open();
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(page.locator("body")).not.toHaveCSS("overflow", "hidden");
  await page.setViewportSize({ width: 320, height: 750 });
  await expect(page.locator("#site-menu")).toBeHidden();
});

for (const mobile of [false, true]) {
  test(`${mobile ? "スマホ" : "PC"}で計算済み経路をヘッダーから双方向に引き継ぐ`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ width: 320, height: 750 });
    const header = page.getByRole("banner");
    const fareLink = header.getByRole("link", { name: "運賃計算", exact: true, includeHidden: true });
    const routeLink = header.getByRole("link", { name: "経路入力検索", exact: true, includeHidden: true });
    const openMenu = async (split: boolean) => {
      if (mobile) await header.getByRole("button", { name: "メニューバーを開く" }).click();
      else if (split) await header.locator("[data-split-trigger]").click();
    };
    const result = page.getByRole("heading", { name: "計算結果", exact: true });
    await page.goto(`/split/route/ticket?${new URLSearchParams({ route: "新茂原[外房]茂原", mode: "cheapest", maxSplits: "1" })}`);
    await expect(result).toBeVisible();
    await expect(fareLink).toHaveAttribute("href", `/fare/ticket${new URL(page.url()).search}`);
    await page.getByRole("button", { name: "経路を逆転", exact: true }).click();
    await expect(page.getByRole("combobox").first()).toHaveValue("茂原");
    // 未計算の逆転はリンクに反映しない。
    await expect(fareLink).toHaveAttribute("href", `/fare/ticket${new URL(page.url()).search}`);
    expect(new URL(page.url()).searchParams.get("route")).toBe("新茂原[外房]茂原");
    await page.getByRole("button", { name: "乗車券を計算", exact: true }).click();
    await expect.poll(() => new URL(page.url()).searchParams.get("route")).toBe("茂原[外房]新茂原");
    await expect(result).toBeVisible();
    await expect(fareLink).toHaveAttribute("href", `/fare/ticket${new URL(page.url()).search}`);
    await openMenu(false);
    await fareLink.click();
    await expect(page).toHaveURL(/\/fare\/ticket\?/);
    await expect(result).toBeVisible();
    await expect(page.getByRole("combobox").first()).toHaveValue("茂原");
    await expect(page.getByRole("radio", { name: /^最安 / })).toBeChecked();
    await expect(routeLink).toHaveAttribute("href", `/split/route/ticket${new URL(page.url()).search}`);
    await openMenu(true);
    await routeLink.click();
    await expect(page).toHaveURL(/\/split\/route\/ticket\?/);
    await expect(result).toBeVisible();
    await expect(page.getByRole("combobox").first()).toHaveValue("茂原");
    await page.goBack();
    await expect(page).toHaveURL(/\/fare\/ticket\?/);
    await expect(routeLink).toHaveAttribute("href", `/split/route/ticket${new URL(page.url()).search}`);
    await page.goForward();
    await expect(page).toHaveURL(/\/split\/route\/ticket\?/);
    await expect(fareLink).toHaveAttribute("href", `/fare/ticket${new URL(page.url()).search}`);
    await openMenu(false);
    await header.getByRole("link", { name: "はじめての方へ" }).click();
    await expect(page).toHaveURL("/guide");
    await expect(fareLink).toHaveAttribute("href", "/fare/ticket");
    await expect(routeLink).toHaveAttribute("href", "/split/route/ticket");
  });
}

test("対象4画面だけでクエリ全体を保持し、クエリなしでは通常リンクにする", async ({ page }) => {
  const query = new URLSearchParams({ route: "新茂原", mode: "uncorrect", month: "3", maxSplits: "2" });
  query.append("noSplitStation", "茂原");
  query.append("noSplitStation", "八積");
  for (const path of ["/fare/ticket", "/fare/pass", "/split/route/ticket", "/split/route/pass", "/guide", "/split/auto/ticket"]) {
    await page.goto(`${path}?${query}`);
    const search = path === "/guide" || path === "/split/auto/ticket" ? "" : `?${query}`;
    await expect(page.locator('header a').filter({ hasText: /^運賃計算$/ })).toHaveAttribute("href", `/fare/ticket${search}`);
    await expect(page.locator('#split-methods a').filter({ hasText: /^経路入力検索$/ })).toHaveAttribute("href", `/split/route/ticket${search}`);
    await expect(page.locator('#split-methods a').filter({ hasText: /^経路自動検索$/ })).toHaveAttribute("href", "/split/auto/ticket");
  }
  await page.goto("/fare/ticket");
  await expect(page.locator('#split-methods a').filter({ hasText: /^経路入力検索$/ })).toHaveAttribute("href", "/split/route/ticket");
});
