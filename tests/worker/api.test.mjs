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

test('API request timeout is 15 seconds', () => {
  assert.equal(API_REQUEST_TIMEOUT_MS, 15_000);
});

test('timeout signal distinguishes timeout from parent abort', () => {
  const parent = new AbortController();
  const timeout = createAbortTimeout(parent.signal, 100);

  parent.abort();

  assert.equal(timeout.signal.aborted, true);
  assert.equal(timeout.didTimeout(), false);
  timeout.dispose();
});

test('disposing timeout prevents a later abort', async () => {
  const timeout = createAbortTimeout(undefined, 10);
  timeout.dispose();

  await wait(30);

  assert.equal(timeout.signal.aborted, false);
  assert.equal(timeout.didTimeout(), false);
});

test('network retry delay is interrupted by the API timeout', async () => {
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
