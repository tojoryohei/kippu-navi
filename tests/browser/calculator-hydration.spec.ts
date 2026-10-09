import { test, expect } from "@playwright/test";

const paths = ["/split/auto/ticket", "/split/auto/pass", "/split/auto/ic-pass", "/fare/ticket", "/fare/pass", "/split/route/ticket", "/split/route/pass"];

for (const path of paths) {
  test(`初期HTMLに操作不可のフォームが含まれる: ${path}`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await page.goto(`http://localhost:4321${path}`);
    const shell = page.locator('[data-calculator-ready="false"]');
    await expect(shell.locator('form')).toBeVisible();
    await expect(shell.locator('[inert]')).toHaveCount(1);
    await expect(shell).toHaveAttribute('aria-busy', 'true');
    await expect(shell).toHaveCSS('filter', 'none');
    expect(await shell.locator('input').count()).toBeGreaterThan(0);
    await context.close();
  });
}

for (const path of ["/split/auto/ticket", "/fare/ticket"]) {
  test(`URL復元後に操作禁止を解除する: ${path}`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => {
      const url = new URL(route.request().url());
      return url.hostname === 'localhost' || url.hostname === '127.0.0.1' ? route.continue() : route.abort();
    });
    await page.goto(`${path}?from=${encodeURIComponent('東京')}`);
    const shell = page.locator('[data-calculator-ready="true"]');
    await expect(shell).toBeVisible();
    await expect(shell.getByRole('combobox').first()).toHaveValue('東京');
    await expect(shell.locator('[inert]')).toHaveCount(0);
    await expect(shell.getByRole('status')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

for (const path of ["/split/auto/ticket", "/fare/ticket"]) {
  test(`起動前後でフォームの高さを維持する: ${path}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return route.abort();
      if (route.request().resourceType() === 'script') await gate;
      return route.continue();
    });
    await page.goto(path, { waitUntil: 'commit' });
    const shell = page.locator('[data-calculator-ready]');
    try {
      await expect(shell.locator('form')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const before = await shell.boundingBox();
      await page.screenshot({ path: testInfo.outputPath(`${path.includes('/fare/') ? 'fare' : 'split'}-inert.png`) });
      release();
      await expect(shell).toHaveAttribute('data-calculator-ready', 'true');
      const after = await shell.boundingBox();
      expect(Math.abs(after!.height - before!.height)).toBeLessThan(2);
      await page.screenshot({ path: testInfo.outputPath(`${path.includes('/fare/') ? 'fare' : 'split'}-ready.png`) });
    } finally {
      release();
    }
  });
}
