import { test, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';
import { createHash } from 'node:crypto';
import type { AddressInfo } from 'node:net';


test('新版はすべての旧画面を閉じるまで待機し、次に開いた画面で反映される', async ({ page, context }) => {
  test.setTimeout(180000);
  const script = readFileSync('dist/sw.js', 'utf8');
  const release = JSON.parse(readFileSync('dist/pwa-assets.json', 'utf8'));
  const originalHtml = readFileSync('dist/changelog.html', 'utf8');
  // テスト用サーバーはビルド済みの資材だけを配信し、リクエストから外部通信しない。
  const staticAssets = new Map<string, { body: Buffer; contentType: string }>();
  const mime: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.wasm': 'application/wasm', '.woff2': 'font/woff2', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
  for (const asset of release.assets as { url: string }[]) {
    const base = `dist/${asset.url === '/' ? 'index.html' : asset.url.slice(1)}`;
    const file = existsSync(`${base}.html`) ? `${base}.html` : base;
    staticAssets.set(asset.url, { body: readFileSync(file), contentType: mime[extname(file)] || 'application/octet-stream' });
  }
  const newHtml = originalHtml.replace('<html', '<html data-test-release="new"');
  const nextRelease = { ...release, version: `${release.version}-test-update`, assets: release.assets.map((asset: { url: string }) => asset.url === '/changelog'
    ? { ...asset, size: Buffer.byteLength(newHtml), sha256: createHash('sha256').update(newHtml).digest('hex') } : asset) };
  let publish = false;
  let broken = false;
  const server = createServer((req, res) => {
    try {
      if (!req.url?.startsWith('/') || req.url.startsWith('//') || req.url.includes('\\')) {
        res.writeHead(400); res.end(); return;
      }
      const path = new URL(req.url, 'http://localhost').pathname;
      if (path === '/sw.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store', 'Service-Worker-Allowed': '/' });
        res.end(publish || broken ? `const RELEASE = ${JSON.stringify(broken ? { ...nextRelease, version: `${nextRelease.version}-broken` } : nextRelease)};\n${script.slice(script.indexOf('\n') + 1)}` : script);
        return;
      }
      if (path === '/changelog' && publish) {
        res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
        res.end(newHtml);
        return;
      }
      const asset = staticAssets.get(path);
      if (!asset) { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': asset.contentType });
      res.end(asset.body);
    } catch { res.writeHead(500); res.end(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  // 実際の広告・監視通信がWorkerの切り替えに干渉しないよう、テスト用の配信元だけを許可する。
  await context.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
  try {
    await context.addInitScript(() => Object.defineProperty(navigator, 'standalone', { value: true }));
    await page.goto(`${origin}/changelog`);
    await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.active?.state), { timeout: 60000 }).toBe('activated');
    await page.reload();
    await expect(page.locator('[data-pwa-storage]')).toHaveText('保存済み');
    const other = await context.newPage();
    await other.goto(`${origin}/fare/ticket`);
    broken = true;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.locator('[data-pwa-state]')).toHaveText('新版の保存に失敗しました', { timeout: 60000 });
    await expect(page.locator('[data-pwa-error]')).toContainText('整合性検証');
    await expect(page.locator('[data-pwa-error]')).toContainText('/changelog');
    await expect(page.locator('[data-pwa-error]')).toContainText('SHA-256が一致しません');
    await expect(page.getByRole('button', { name: '今すぐ更新' })).toBeHidden();
    expect(await page.locator('html').getAttribute('data-test-release')).toBeNull();
    broken = false;
    publish = true;
    await page.evaluate(async () => { await (await navigator.serviceWorker.getRegistration())!.update(); });
    await expect(page.locator('[data-pwa-state]')).toHaveText('次回起動で反映予定', { timeout: 60000 });
    await expect(page.locator('[data-pwa-error]')).toBeEmpty();
    expect(await page.locator('html').getAttribute('data-test-release')).toBeNull();
    await expect(page.getByRole('button', { name: '今すぐ更新' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'アップデートを確認' })).toHaveCount(0);
    const waitingVersion = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      return new Promise<string>(resolve => {
        const channel = new MessageChannel();
        channel.port1.onmessage = event => { channel.port1.close(); resolve(event.data.version); };
        registration!.waiting!.postMessage({ type: 'PWA_STATUS' }, [channel.port2]);
      });
    });
    const workers = context.serviceWorkers();
    const versions = await Promise.all(workers.map(worker => worker.evaluate<string>('RELEASE.version')));
    const waitingWorker = workers[versions.indexOf(waitingVersion)];
    expect(waitingWorker).toBeDefined();
    await page.goto('about:blank');
    // 別画面が旧版を使っている間は、新版を有効化しない。
    expect(await other.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting?.state)).toBe('installed');
    await other.close();
    await expect.poll(() => waitingWorker.evaluate<boolean>('self.registration.waiting === null && self.registration.active?.state === "activated"')).toBe(true);
    await page.goto(`${origin}/changelog`);
    await expect(page.locator('html')).toHaveAttribute('data-test-release', 'new', { timeout: 30000 });
    await expect(page.getByRole('button', { name: '今すぐ更新' })).toBeHidden();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-test-release', 'new');
    await expect(page.locator('[data-pwa-storage]')).toHaveText('保存済み');
    // 状態問い合わせだけを無応答にしても、有効なWorkerは停止しない。
    await page.evaluate(() => {
      const postMessage = ServiceWorker.prototype.postMessage;
      ServiceWorker.prototype.postMessage = function (message, ...args) {
        if (message?.type === 'PWA_STATUS') return;
        return Reflect.apply(postMessage, this, [message, ...args]);
      };
      window.dispatchEvent(new Event('offline'));
    });
    await expect(page.locator('[data-pwa-error]')).toContainText('応答がありません', { timeout: 15000 });
    expect(await page.evaluate(() => navigator.serviceWorker.controller?.state)).toBe('activated');
    await page.reload();
    await expect(page.locator('[data-pwa-storage]')).toHaveText('保存済み');
    await expect(page.locator('[data-pwa-error]')).toBeEmpty();
  } finally {
    await context.setOffline(false);
    await page.close();
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

test('Workerの登録失敗を詳細付きで表示する', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
    navigator.serviceWorker.register = async () => { throw new TypeError('Service Worker script unavailable'); };
  });
  await page.goto('/changelog');
  await expect(page.locator('[data-pwa-state]')).toHaveText('更新確認に失敗しました');
  await expect(page.locator('[data-pwa-error]')).toContainText('処理: 更新確認');
  await expect(page.locator('[data-pwa-error]')).toContainText('TypeError: Service Worker script unavailable');
  await expect(page.getByRole('button', { name: '今すぐ更新' })).toBeHidden();
});
