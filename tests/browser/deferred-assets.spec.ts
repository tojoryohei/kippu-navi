import { test, expect } from '@playwright/test';

test('広告は実際のFCPから1秒以上待ち、画面遷移と戻るでも重複取得しない', async ({ page }) => {
  let adsRequests = 0;
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/adsbygoogle.js')) {
      adsRequests++;
      return route.fulfill({ contentType: 'text/javascript', body: '' });
    }
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
  });
  await page.goto('/');
  await expect.poll(() => adsRequests).toBe(1);
  await expect.poll(() => page.evaluate(() => {
    const paint = performance.getEntriesByName('first-contentful-paint')[0];
    const request = performance.getEntriesByType('resource').find(entry => entry.name.includes('/adsbygoogle.js'));
    return paint && request ? request.startTime - paint.startTime : 0;
  })).toBeGreaterThanOrEqual(1000);
  await page.getByRole('link', { name: '経路自動検索', exact: false }).first().click();
  await expect(page).toHaveURL(/\/split\/auto\/ticket/);
  await expect(page.locator('[data-calculator-ready]')).toHaveAttribute('data-calculator-ready', 'true');
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('きっぷナビへようこそ');
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.locator('script[data-astro-transition-persist="adsense"]')).toHaveCount(1);
  expect(adsRequests).toBe(1);
});
