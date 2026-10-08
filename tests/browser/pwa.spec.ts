import { test, expect, type Page } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

test('旧URLは配信側で301転送し、生成物とPWA保存対象には含めない', async ({ request }) => {
  expect(existsSync('dist/split/ticket.html')).toBe(false);
  const assets = JSON.parse(readFileSync('dist/pwa-assets.json', 'utf8')).assets as { url: string }[];
  const urls = assets.map(asset => asset.url);
  expect(urls).not.toContain('/split/ticket');
  expect(urls).toContain('/split/auto/ticket');
  const response = await request.get('/split/ticket?from=Tokyo&to=Shinagawa', { maxRedirects: 0 });
  expect(response.status()).toBe(301);
  expect(response.headers().location).toBe('/split/auto/ticket?from=Tokyo&to=Shinagawa');
});

async function blockExternal(page: Page) {
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return ['localhost', '127.0.0.1'].includes(url.hostname) ? route.continue() : route.abort();
  });
}

test('通常ブラウザは一括保存せず、追加時の検索条件をmanifestへ渡す', async ({ page }) => {
  await blockExternal(page);
  await page.goto('/split/route/pass?route=東京[東海道]品川&month=3');
  await expect.poll(() => page.locator('link[rel="manifest"]').getAttribute('href')).toContain('launch=');
  const manifest = await page.evaluate(async () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]')!;
    return (await fetch(link.href)).json();
  });
  expect(manifest.start_url).toContain('month=3');
  expect(manifest.start_url).toContain('route=');
  expect(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length))).toBe(0);
  expect(await page.evaluate(() => caches.keys())).toEqual([]);
  await page.getByRole('link', { name: 'きっぷナビ', exact: true }).click();
  await expect.poll(() => page.locator('link[rel="manifest"]').getAttribute('href')).toContain('launch=%2F');
});

test('PWAは全資材を保存し、未使用のページ・全券種の計算・進捗をオフラインで利用できる', async ({ page, context }) => {
  test.setTimeout(240_000);
  await blockExternal(page);
  // iOSのホーム画面コンテキストを再現。実際の追加UIは実機で別途確認する。
  await page.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
  await page.goto('/');
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state), { timeout: 90_000 }).toBe('activated');
  const cached = await page.evaluate(async () => {
    const name = (await caches.keys()).find(k => k.startsWith('kippu-pwa-'))!;
    return (await (await caches.open(name)).keys()).map(r => new URL(r.url).pathname);
  });
  expect(cached.filter(p => p.endsWith('.woff2')).length).toBeGreaterThan(100);
  expect(cached).toContain('/articles/jr-fare-system');
  expect(cached).not.toContain('/split/ticket');
  expect(cached).toContain('/split/auto/ticket');
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await context.setOffline(true);
  for (const kind of ['ticket', 'pass', 'ic-pass']) {
    await page.goto(`/split/auto/${kind}?from=新茂原&to=茂原&month=1&maxSplits=1`);
    await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await expect(page.getByText('端末内で計算しています', { exact: false })).toHaveCount(0);
  }
  for (const kind of ['ticket', 'pass']) {
    await page.goto(`/split/route/${kind}?${new URLSearchParams({ route: '東京[東海道]品川', month: '3', maxSplits: '1' })}`);
    await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByRole('progressbar')).toHaveCount(0);
    await page.goto(`/fare/${kind}?${new URLSearchParams({ route: '東京[東海道]品川', month: '6' })}`);
    await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible({ timeout: 60_000 });
  }
  await page.goto('/articles/jr-fare-system');
  await expect(page.locator('h1')).toBeVisible();
  expect(await page.evaluate(async () => {
    await document.fonts.load('400 16px "Noto Sans JP Variable"', '髙﨑新茂原');
    return document.fonts.check('400 16px "Noto Sans JP Variable"', '髙﨑新茂原');
  })).toBe(true);
});

for (const kind of ['ticket', 'pass', 'ic-pass']) {
  test(`API 503は${kind}の端末内計算へ切り替わる`, async ({ page }) => {
    await blockExternal(page);
    await page.route('**/api/**', route => route.fulfill({ status: 503, body: 'unavailable' }));
    await page.goto(`/split/auto/${kind}?from=新茂原&to=茂原&month=1&maxSplits=1`);
    await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible({ timeout: 60_000 });
  });
}
test('API 400は端末内検索へ切り替えず既存のエラーを表示する', async ({ page }) => {
  await blockExternal(page);
  await page.route('**/api/**', route => route.fulfill({ status: 400, json: { error: '入力を確認してください' } }));
  await page.goto('/split/auto/pass?from=新茂原&to=茂原');
  await expect(page.getByText('入力を確認してください', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toHaveCount(0);
});
