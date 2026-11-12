import { test, expect, type Page } from '../support/fixtures';

// 時間経過は単体テストの仮想時計で検証し、ブラウザでは通信の解除を明示する。
async function gateEngine(page: Page) {
  const pending: Array<() => void> = [];
  let workers = 0;
  page.on('worker', () => { workers++; });
  await page.route('**/main.wasm', async route => {
    await new Promise<void>(resolve => pending.push(resolve));
    await route.continue();
  });
  return {
    workers: () => workers,
    async releaseNext() {
      await expect.poll(() => pending.length).toBeGreaterThan(0);
      pending.shift()!();
    },
  };
}

test('準備中はEnterでも検索せず、準備完了後に一度だけ自動計算する', async ({ page }) => {
  const engine = await gateEngine(page);
  await page.goto('/fare/ticket?' + new URLSearchParams({ route: '東京[東海道]品川', mode: 'normal' }));
  const button = page.getByRole('button', { name: '計算エンジンを準備中', exact: true });
  await expect(button).toBeDisabled();
  await page.locator('form').press('Enter');
  await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toHaveCount(0);
  await engine.releaseNext();
  await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible();
  expect(engine.workers()).toBe(1);
});

test('準備中の入力変更はURL自動検索を取り消す', async ({ page }) => {
  const engine = await gateEngine(page);
  await page.goto('/fare/ticket?' + new URLSearchParams({ route: '東京[東海道]品川', mode: 'normal' }));
  const button = page.locator('button[type="submit"]');
  await expect(button).toHaveText('計算エンジンを準備中');
  const input = page.getByRole('combobox').first();
  const original = await input.inputValue();
  await input.fill('新宿');
  await input.fill(original);
  await engine.releaseNext();
  await expect(button).not.toHaveText('計算エンジンを準備中');
  await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toHaveCount(0);
});

// ルーティング全通りではなく、独立した2種類のフォーム実装を確認する。
for (const path of ['/fare/pass', '/split/auto/ticket']) {
  test(`入力は準備中でも操作でき、準備完了後にボタン表示が切り替わる: ${path}`, async ({ page }) => {
    const engine = await gateEngine(page);
    await page.goto(path);
    const button = page.locator('button[type="submit"]');
    if (path === '/split/auto/ticket') {
      // WASM本体が未取得でも、軽量な環境確認が済めばAPI検索を開始できる。
      await expect(button).not.toHaveText('計算エンジンを準備中');
    } else await expect(button).toHaveText('計算エンジンを準備中');
    await expect(button).toBeDisabled();
    await expect(page.getByRole('combobox').first()).toBeEditable();
    await engine.releaseNext();
    await expect(button).not.toHaveText('計算エンジンを準備中');
    await expect(button).toBeDisabled(); // 入力はまだ空
  });
}

test('定期券の準備が完了しても乗車券の準備完了として扱わない', async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.addEventListener('message', event => {
          if (event.data.type === 'ready' && event.data.capability === 'pass') document.documentElement.dataset.passReady = 'true';
        });
      }
    };
  });
  await page.route('**/ticket_graph_data.bin', async route => { await gate; await route.continue(); });
  try {
    await page.goto('/fare/ticket');
    const button = page.locator('button[type="submit"]');
    await expect(button).toHaveText('計算エンジンを準備中');
    await expect(page.locator('html')).toHaveAttribute('data-pass-ready', 'true');
    await expect(button).toHaveText('計算エンジンを準備中');
    release();
    await expect(button).not.toHaveText('計算エンジンを準備中');
  } finally { release(); }
});

test('端末内探索の追加Workerを待つ間も準備中と表示する', async ({ page }) => {
  const engine = await gateEngine(page);
  await page.route('**/api/split/**', route => route.fulfill({ status: 503, body: '{}' }));
  await page.goto('/split/auto/ticket?' + new URLSearchParams({ from: '東京', to: '品川', maxSplits: '1' }));
  await engine.releaseNext();
  // 初期Workerに続き、端末内探索用WorkerのWASM取得を保留する。
  await expect.poll(engine.workers).toBe(2);
  await expect(page.locator('button[type="submit"]')).toHaveText('計算エンジンを準備中');
  await engine.releaseNext();
  await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible();
});
