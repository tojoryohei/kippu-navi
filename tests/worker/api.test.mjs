import assert from 'node:assert/strict';
import test from 'node:test';

import {
  API_REQUEST_TIMEOUT_MS,
  createAbortTimeout,
  fetchWithNetworkRetry,
} from '../../src/app/lib/api.ts';

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

test('APIリクエストのタイムアウトは15秒である', () => {
  assert.equal(API_REQUEST_TIMEOUT_MS, 15_000);
});

test('タイムアウトと親からの中断を区別する', () => {
  const parent = new AbortController();
  const timeout = createAbortTimeout(parent.signal, 100);

  parent.abort();

  assert.equal(timeout.signal.aborted, true);
  assert.equal(timeout.didTimeout(), false);
  timeout.dispose();
});

test('タイムアウトを解除すると後から中断されない', async () => {
  const timeout = createAbortTimeout(undefined, 10);
  timeout.dispose();

  await wait(30);

  assert.equal(timeout.signal.aborted, false);
  assert.equal(timeout.didTimeout(), false);
});

test('通信の再試行待機はAPIのタイムアウトで中断される', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('network failure');
  };

  const timeout = createAbortTimeout(undefined, 20);
  try {
    await assert.rejects(
      fetchWithNetworkRetry('https://example.invalid', { signal: timeout.signal }),
      error => error instanceof DOMException && error.name === 'TimeoutError',
    );
    assert.equal(calls, 1);
    assert.equal(timeout.didTimeout(), true);
  } finally {
    timeout.dispose();
    globalThis.fetch = originalFetch;
  }
});

test('一時的なHTTP 502は1回再試行して成功レスポンスを返す', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(calls === 1 ? '<html>Bad Gateway</html>' : '{"ok":true}', {
      status: calls === 1 ? 502 : 200,
    });
  };

  try {
    const response = await fetchWithNetworkRetry('https://example.invalid');
    assert.equal(calls, 2);
    assert.deepEqual(await response.json(), { ok: true });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('HTTP 400は再試行せずに返す', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response('{"error":"bad request"}', { status: 400 });
  };

  try {
    const response = await fetchWithNetworkRetry('https://example.invalid');
    assert.equal(response.status, 400);
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
