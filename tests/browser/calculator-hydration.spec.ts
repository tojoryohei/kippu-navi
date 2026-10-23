import { test, expect } from "@playwright/test";

const paths = ["/split/auto/ticket", "/split/auto/pass", "/split/auto/ic-pass", "/fare/ticket", "/fare/pass", "/split/route/ticket", "/split/route/pass"];

test("全計算ページの初期HTMLに操作不可のフォームが含まれる", async ({ request }) => {
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status()).toBe(200);
    const html = await response.text();
    expect(html).toContain('data-calculator-ready="false"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toMatch(/<form[\s>]/);
    expect(html).toMatch(/\sinert(?:[\s=>])/);
    expect(html).toMatch(/<input[\s>]/);
  }
});

for (const path of ["/split/auto/ticket", "/fare/ticket", "/split/route/ticket"]) {
  test(`起動前後の高さとURL復元・操作禁止解除を確認する: ${path}`, async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') return route.abort();
      if (route.request().resourceType() === 'script') await gate;
      return route.continue();
    });
    await page.goto(path + "?from=" + encodeURIComponent("東京"), { waitUntil: 'commit' });
    const shell = page.locator('[data-calculator-ready]');
    try {
      await expect(shell.locator('form')).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(shell.locator('[inert]')).toHaveCount(1);
      await expect(shell).toHaveAttribute('aria-busy', 'true');
      const before = await shell.boundingBox();
      release();
      await expect(shell).toHaveAttribute('data-calculator-ready', 'true');
      await expect(shell.getByRole('combobox').first()).toHaveValue('東京');
      await expect(shell.locator('[inert]')).toHaveCount(0);
      await expect(shell.getByRole('status')).toHaveCount(0);
      const after = await shell.boundingBox();
      expect(Math.abs(after!.height - before!.height)).toBeLessThan(2);
    } finally {
      release();
    }
  });
}
