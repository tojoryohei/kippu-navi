import test from 'node:test';
import assert from 'node:assert/strict';
import { formatEngineError, SearchOperationError } from '../../src/lib/search-errors.ts';
import { readEngineAsset } from '../../src/lib/read-engine-asset.ts';
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function mockFetch(t, headers = true) {
  let body;
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => {
    if (!headers) return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
    const stream = new ReadableStream({ start(controller) {
      body = controller;
      signal.addEventListener('abort', () => controller.error(new DOMException('Aborted', 'AbortError')));
    } });
    return new Response(stream);
  });
  return () => body;
}
test('30秒以上かかっても受信が続けば本文を結合して成功する', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const body = mockFetch(t);
  const progress = [];
  const result = readEngineAsset('/main.wasm', bytes => progress.push(bytes));
  await flush();
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(20_000);
    body().enqueue(new Uint8Array([i]));
    await flush();
  }
  body().close();
  assert.deepEqual([...new Uint8Array((await result).buffer)], [0, 1, 2, 3]);
  assert.ok(progress.length >= 1);
});
for (const headers of [false, true]) {
  test(`${headers ? '本文' : 'ヘッダー'}が30秒停滞すると中断し診断を残す`, async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] });
    const body = mockFetch(t, headers);
    const result = readEngineAsset('/main.wasm', () => {});
    const rejected = assert.rejects(result, error => {
      assert.equal(error.timedOut, true);
      assert.equal(error.abortReason, 'network_idle');
      assert.equal(error.receivedBytes, headers ? 2 : 0);
      const displayed = formatEngineError(new SearchOperationError({ message: error.message, code: 'engine_asset_fetch_failed', source: 'worker', stage: 'wasm_fetch', retryable: true, retryCount: 0, workerRestartCount: 0, diagnostics: { resources: [{ url: '/main.wasm', phase: 'wasm_fetch', attempt: 1, elapsedMs: 30_000, outcome: 'failure', abortReason: error.abortReason }] } }));
      assert.equal(displayed, "通信環境を確認して、もう一度計算してください。");
      return true;
    });
    await flush();
    if (headers) { body().enqueue(new Uint8Array([1, 2])); await flush(); }
    t.mock.timers.tick(30_000);
    await rejected;
  });
}
