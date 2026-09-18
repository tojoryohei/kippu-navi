import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCacheableApiUrl, proxyApi } from '../../workers/frontend.mjs';

test('cacheable API query is allowlisted and normalized', () => {
  const normalized = normalizeCacheableApiUrl(new URL(
    'https://kippu-navi.com/api/split-pass?to=B&ignored=x&noSplitStation=Z&from=A&noSplitStation=Y&noSplitStation=Z&months=3',
  ));
  assert.equal(
    normalized?.toString(),
    'https://kippu-navi.com/api/split-pass?from=A&to=B&months=3&noSplitStation=Y&noSplitStation=Z',
  );
});

test('non-cacheable API path is not normalized', () => {
  assert.equal(normalizeCacheableApiUrl(new URL('https://kippu-navi.com/api/fare')), null);
});

test('cacheable GET strips private and bypass headers and applies edge caching', async t => {
  const originalFetch = globalThis.fetch;
  let capturedRequest;
  let capturedOptions;
  globalThis.fetch = async (request, options) => {
    capturedRequest = request;
    capturedOptions = options;
    return Response.json({ ok: true }, {
      headers: { 'Cache-Control': 'public, max-age=86400' },
    });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await proxyApi(new Request(
    'https://kippu-navi.com/api/split-ticket?to=B&from=A',
    {
      headers: {
        Authorization: 'Bearer secret',
        Cookie: 'session=secret',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    },
  ), 'https://calculation-engine.example.com');

  assert.equal(capturedRequest.url, 'https://calculation-engine.example.com/api/split-ticket?from=A&to=B');
  assert.equal(capturedRequest.headers.has('authorization'), false);
  assert.equal(capturedRequest.headers.has('cookie'), false);
  assert.equal(capturedRequest.headers.has('cache-control'), false);
  assert.equal(capturedRequest.headers.has('pragma'), false);
  assert.deepEqual(capturedOptions.cf, {
    cacheEverything: true,
    cacheTtlByStatus: { '200-299': 2592000, '300-599': 0 },
  });
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=2592000');
});

test('POST requests do not enable shared caching', async t => {
  const originalFetch = globalThis.fetch;
  let capturedOptions = 'not called';
  globalThis.fetch = async (_request, options) => {
    capturedOptions = options;
    return Response.json({ ok: true });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  await proxyApi(new Request('https://kippu-navi.com/api/fare', {
    method: 'POST',
    body: '{}',
  }), 'https://calculation-engine.example.com');

  assert.equal(capturedOptions, undefined);
});

test('unsuccessful GET responses are not exposed as cacheable', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { error: 'bad request' },
    { status: 400, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await proxyApi(new Request(
    'https://kippu-navi.com/api/split-ticket?from=A&to=A',
  ), 'https://calculation-engine.example.com');

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
