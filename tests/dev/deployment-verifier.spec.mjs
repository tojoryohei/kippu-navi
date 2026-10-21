import { test, expect } from '@playwright/test';
import { verifyCalculator, matchesSearch } from '../../scripts/verification/browser.mjs';
import { cases } from '../../scripts/verification/config.mjs';
const base = 'http://127.0.0.1:3018';
// ローカルの実API・WASMで検証器を確認する。公開環境の受入とは分ける。
for (const c of cases) {
  test(`検証器の正常系: ${c.kind}の実API・WASM・表示金額`, async ({ page }) => {
    await verifyCalculator(page, base, { enginePath: '/engine' }, c);
  });
}
test('検証器の失敗検出: API 500をローカル計算成功で代替しない', async ({ page }) => {
  await page.route('**/api/split/auto/ticket?*', route => route.fulfill({ status: 500, json: { error: 'verifier-test' } }));
  await expect(verifyCalculator(page, base, { enginePath: '/engine' }, cases[0], 5000)).rejects.toThrow();
});
test('検証器の失敗検出: WASM通信失敗', async ({ page }) => {
  await page.route('**/engine/main.wasm', route => route.abort('failed'));
  await expect(verifyCalculator(page, base, { enginePath: '/engine' }, cases[0], 3000)).rejects.toThrow();
});
test('検証器の失敗検出: 表示金額の期待値不一致', async ({ page }) => {
  await expect(verifyCalculator(page, base, { enginePath: '/engine' }, { ...cases[0], fare: 99999 }, 10000)).rejects.toThrow();
});
test('別の検索・期間・origin・HTTPメソッドを応答待機で拾わない', () => {
  const c = cases[1];
  const make = (url, method = 'GET') => ({ url: () => url, request: () => ({ method: () => method }) });
  const url = `${base}/api/split/auto/pass?from=茂原&to=新茂原&months=3`;
  expect(matchesSearch(make(url), base, c)).toBe(true);
  for (const candidate of [url.replace('months=3', 'months=6'), url.replace('from=茂原', 'from=東京'), url.replace(base, 'https://other.invalid'), url.replace('/pass?', '/ticket?')]) {
    expect(matchesSearch(make(candidate), base, c)).toBe(false);
  }
  expect(matchesSearch(make(url, 'POST'), base, c)).toBe(false);
});
