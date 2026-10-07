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
