import { test, expect } from "@playwright/test";

for (const path of ["/fare/ticket", "/split/auto/ticket"]) {
  test(`駅候補を仮想化して末尾まで操作できる: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.route("**/*", route => new URL(route.request().url()).hostname === "localhost" ? route.continue() : route.abort());
    await page.goto(path);
    await expect(page.locator('[data-calculator-ready="true"]')).toBeVisible();
    const input = page.getByRole("combobox").first();
    await input.fill("し");
    const options = page.getByRole("option");
    await expect(options.first()).toBeVisible();
    const total = Number(await options.first().getAttribute("aria-setsize"));
    expect(total).toBeGreaterThan(100);
    const counts = await page.locator(".station-select__menu-list").evaluate(menu => {
      const bounds = menu.getBoundingClientRect();
      const nodes = [...menu.querySelectorAll('[role="option"]')];
      return { rendered: nodes.length, visible: nodes.filter(node => {
        const rect = node.getBoundingClientRect();
        return rect.bottom > bounds.top && rect.top < bounds.bottom;
      }).length };
    });
    expect(counts.rendered).toBeLessThanOrEqual(counts.visible + 11);
    await input.press("End");
    const last = page.locator(`[role=option][aria-posinset="${total}"]`);
    await expect(last).toBeInViewport();
    const active = await input.getAttribute("aria-activedescendant");
    // Apple環境ではreact-selectがライブ領域で読み上げる。
    if (active) expect(active).toBe(await last.getAttribute("id"));
    await expect(last).toHaveClass(/is-focused/);
    const name = (await last.innerText()).split("\n").at(-1)!;
    await input.press("Enter");
    await expect(input).toHaveValue(name);
    await input.fill("し");
    await input.press("Home");
    await expect(page.locator('[role=option][aria-posinset="1"]')).toBeInViewport();
    await input.press("PageDown");
    const focused = await input.getAttribute("aria-activedescendant");
    await expect(focused ? page.locator(`[id="${focused}"]`) : page.locator(".station-select__option--is-focused")).toBeInViewport();
    await input.press("ArrowDown");
    await input.press("ArrowUp");
    await input.press("PageUp");
    await input.press("Escape");
    await expect(options).toHaveCount(0);
    await input.fill("存在しない駅名xyz");
    await expect(page.getByText("該当する駅がありません")).toBeVisible();
    await input.fill("東京");
    await expect(options).toHaveCount(1);
    await input.press("Tab");
    await expect(options).toHaveCount(0);
    await input.fill("");
    await expect(options).toHaveCount(0);
  });

  test(`スクロールで全候補へ到達しフォーカスへ引き戻されない: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator('[data-calculator-ready="true"]')).toBeVisible();
    // 運賃データには同名の燕三条が2件あるため、両方への到達も検証する。
    await page.getByRole("combobox").first().fill(path === "/fare/ticket" ? "つ" : "し");
    const menu = page.locator(".station-select__menu-list");
    await expect(menu).toBeVisible();
    const total = Number(await page.getByRole("option").first().getAttribute("aria-setsize"));
    const visited = new Set<number>();
    for (let step = 0; step < 100; step++) {
      for (const position of await page.getByRole("option").evaluateAll(nodes => nodes.map(node => Number(node.getAttribute("aria-posinset"))))) visited.add(position);
      if (visited.size === total) break;
      await menu.evaluate(node => { node.scrollTop += 200; });
      await page.waitForTimeout(30);
    }
    expect(visited.size).toBe(total);
    const offset = await menu.evaluate(node => node.scrollTop);
    await page.waitForTimeout(100);
    expect(await menu.evaluate(node => node.scrollTop)).toBe(offset);
    await page.locator(`[role=option][aria-posinset="${total}"]`).click();
    await expect(menu).toHaveCount(0);
  });
}

test("狭い画面で折り返した候補が重ならない", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/fare/ticket");
  await expect(page.locator('[data-calculator-ready="true"]')).toBeVisible();
  await page.getByRole("combobox").first().fill("し");
  await page.locator(".station-select__menu-list").evaluate(node => { node.style.width = "120px"; node.style.fontSize = "32px"; });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(async () => page.locator(".station-virtual-row").evaluateAll(nodes => {
    const boxes = nodes.map(node => node.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    return boxes.every((box, i) => i === 0 || box.top >= boxes[i - 1].bottom - 1);
  })).toBe(true);
  expect(await page.locator(".station-virtual-row").evaluateAll(nodes => nodes.some(node => node.getBoundingClientRect().height > 60))).toBe(true);
});

test("除外駅の多数候補も仮想化し、変換中のEnterでは確定しない", async ({ page }) => {
  await page.goto("/split/auto/ticket");
  await expect(page.locator('[data-calculator-ready="true"]')).toBeVisible();
  await page.locator("form summary").click();
  const input = page.getByLabel("分割禁止駅", { exact: true });
  await input.fill("し");
  expect(await page.getByRole("option").count()).toBeLessThan(25);
  await input.dispatchEvent("compositionstart");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", keyCode: 229, isComposing: true, bubbles: true });
  await expect(input).toHaveValue("し");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(0);
  await input.dispatchEvent("compositionend", { data: "し" });
  await input.press("End");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await expect(page.locator("#selected-no-split-stations li")).toHaveCount(1);
});

test("読み上げ対象を画面外でも保持し、ホイール操作で戻さない", async ({ page }) => {
  // Apple以外のreact-selectが使うaria-activedescendantも確認する。
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "platform", { get: () => "Win32" });
    Object.defineProperty(navigator, "userAgentData", { get: () => ({ platform: "Windows" }) });
  });
  await page.goto("/fare/ticket");
  await expect(page.locator('[data-calculator-ready="true"]')).toBeVisible();
  const input = page.getByRole("combobox").first();
  await input.fill("し");
  await input.press("Home");
  const active = await input.getAttribute("aria-activedescendant");
  expect(active).toBeTruthy();
  const menu = page.locator(".station-select__menu-list");
  await menu.hover();
  await page.mouse.wheel(0, 800);
  await expect.poll(() => menu.evaluate(node => node.scrollTop)).toBeGreaterThan(300);
  const scrolledActive = await input.getAttribute("aria-activedescendant");
  await expect(page.locator(`[id="${scrolledActive}"]`)).toHaveCount(1);
  await input.press("End");
  const lastActive = await input.getAttribute("aria-activedescendant");
  await expect(page.locator(`[id="${lastActive}"]`)).toBeInViewport();
});

test.describe("タッチ環境の駅候補", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("タッチ操作で候補リストをスクロールできる", async ({ page }) => {
    await page.goto("/fare/ticket");
    await expect(page.locator('[data-calculator-ready="true"]')).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await page.getByRole("combobox").first().fill("し");
    const menu = page.locator(".station-select__menu-list");
    await expect(menu).toBeVisible();
    await menu.scrollIntoViewIfNeeded();
    // レイアウト確定とコンポジタへの反映を待ってから座標を取得する。
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    const rect = (await menu.boundingBox())!;
    const x = Math.round(rect.x + rect.width / 2);
    const startY = Math.floor(Math.min(rect.y + rect.height, 844) - 20);
    const endY = Math.ceil(Math.max(rect.y, 0) + 20);
    expect(startY - endY).toBeGreaterThan(100);
    expect(await menu.evaluate((node, point) => node.contains(document.elementFromPoint(point.x, point.y)), { x, y: startY })).toBe(true);

    expect(await menu.evaluate(node => node.scrollTop)).toBe(0);

    // 一括の合成スクロールではなく、押下から移動・離すまで実際のタッチ入力を送る。
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: startY }] });
    try {
      for (let step = 1; step <= 10; step++) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [{ x, y: Math.round(startY + (endY - startY) * step / 10) }],
        });
        // 各移動を別フレームで処理し、タッチスワイプとして認識させる。
        await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())));
      }
    } finally {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await expect.poll(() => menu.evaluate(node => node.scrollTop)).toBeGreaterThan(50);
    await expect(page.getByRole("option").first()).toBeAttached();
    expect(await page.getByRole("option").count()).toBeLessThan(25);
  });
});
