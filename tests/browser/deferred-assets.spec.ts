import { test, expect } from '@playwright/test';

for (const [width, pwa] of [[390, false]] as const) {
  test(`広告は表示・取得せず、計算画面の遷移を維持する (${width}px, PWA=${pwa})`, async ({ page }) => {
    if (pwa) await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await page.setViewportSize({ width, height: 900 });
    const adRequests: string[] = [];
    page.on('request', request => {
      if (/admax|shinobi\.jp|googlesyndication|googleadservices|doubleclick|adtrafficquality|fundingchoices/i.test(request.url())) adRequests.push(request.url());
    });
    await page.route('**/*', route => ['localhost', '127.0.0.1'].includes(new URL(route.request().url()).hostname) ? route.continue() : route.abort());
    await page.clock.install();
    await page.goto('/');
    // 旧広告の遅延起動期限を超えても取得されないことを確認する。
    await page.clock.runFor(5500);
    await page.getByRole('link', { name: '経路自動検索', exact: false }).first().click();
    await expect(page).toHaveURL(/\/split\/auto\/ticket/);
    await expect(page.locator('[data-calculator-ready]')).toHaveAttribute('data-calculator-ready', 'true');
    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('きっぷナビへようこそ');
    expect(adRequests).toEqual([]);
    await expect(page.locator('[data-sidebar-ad], .admax-ads, ins.adsbygoogle, meta[name="deferred-adsense"]')).toHaveCount(0);
  });
}
