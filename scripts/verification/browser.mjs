import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { expectedJson } from './config.mjs';
const { expect } = createRequire(resolve(process.env.SMOKE_TOOL_ROOT || '.', 'package.json'))('@playwright/test');

export function matchesSearch(response, base, c) {
  const url = new URL(response.url());
  const request = response.request();
  return request.method() === 'GET' && url.origin === new URL(base).origin && url.pathname === `/api/split/auto/${c.kind}`
    && url.searchParams.get('from') === c.from && url.searchParams.get('to') === c.to
    && url.searchParams.get('months') === (c.months ? String(c.months) : null);
}

export async function verifyCalculator(page, base, manifest, c, timeoutMs = 45000) {
  // 検索操作より前にエンジンが取得される場合もあるため、遷移前に待機を登録する。
  const wasmPromise = page.waitForResponse(response => response.url() === `${base}${manifest.enginePath}/main.wasm`, { timeout: timeoutMs });
  const wasmCheck = wasmPromise.then(async response => {
    expect(response.status(), '対象WASMのHTTP status').toBe(200);
    expect((await response.body()).subarray(0, 4).equals(Buffer.from([0, 97, 115, 109])), '対象WASMのmagic').toBe(true);
  });
  // 未処理の拒否を防ぎ、失敗は後続のPromise.allで再送出する。
  void wasmCheck.catch(() => {});
  await page.goto(`${base}/split/auto/${c.kind}`);
  await expect(page.locator('[data-calculator-ready="true"]')).toBeVisible();
  if (c.months) await page.getByRole('button', { name: `${c.months}箇月`, exact: true }).click();
  await page.getByRole('combobox', { name: '発駅', exact: true }).fill(c.from);
  await page.getByRole('combobox', { name: '着駅', exact: true }).fill(c.to);
  const apiPromise = page.waitForResponse(response => matchesSearch(response, base, c), { timeout: timeoutMs });
  const apiCheck = apiPromise.then(async response => {
    expect(response.status(), '実APIのHTTP status（フォールバック成功では代替しない）').toBe(200);
    expect(await response.json()).toEqual(expectedJson(c));
    return { status: response.status(), requestId: response.headers()['x-request-id'] ?? null,
      actualCommit: response.headers()['x-deployment-commit'] ?? null };
  });
  void apiCheck.catch(() => {});
  await page.getByRole('button', { name: c.button, exact: true }).click();
  const [api] = await Promise.all([apiCheck, wasmCheck]);
  await expect(page.getByRole('heading', { name: '計算結果', exact: true })).toBeVisible();
  const before = page.locator('section').filter({ has: page.getByRole('heading', { name: c.before, exact: true }) });
  await expect(before).toBeVisible();
  await expect(before).toContainText(c.from);
  await expect(before).toContainText(c.to);
  await expect(before).toContainText(`¥${c.fare.toLocaleString('en-US')}`);
  const best = page.locator('section').filter({ has: page.getByRole('heading', { name: '最安分割運賃', exact: true }) });
  await expect(best).toContainText(`¥${c.fare.toLocaleString('en-US')}`);
  return { ...api, kind: c.kind, from: c.from, to: c.to, months: c.months, expectedFare: c.fare, wasmPath: `${manifest.enginePath}/main.wasm` };
}
