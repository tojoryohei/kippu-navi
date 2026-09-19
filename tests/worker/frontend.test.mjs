import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeCacheableApiUrl, proxyApi, proxySentry } from '../../workers/frontend.mjs';
import { buildSearchCompletedProperties } from '../../src/lib/analytics-events.ts';
import { classifyCalculationError } from '../../src/lib/search-errors.ts';

const sentryDsn = 'https://public-key@o123.ingest.sentry.io/456';
const sentryEnvelope = dsn => `${JSON.stringify({ dsn })}\n${JSON.stringify({ type: 'event' })}\n{}`;

test('calculation errors distinguish business errors from system failures', () => {
  assert.equal(classifyCalculationError('経路が重複しています。'), 'duplicate_route');
  assert.equal(classifyCalculationError('再考：要求区間誤り'), 'path_invalid');
  assert.equal(classifyCalculationError('unexpected failure'), 'calculation_failed');
});

test('PostHog search payload contains aggregate fields only', () => {
  const properties = buildSearchCompletedProperties({
    searchType: 'ticket',
    calculationMode: 'normal',
    capability: 'ticket',
    elapsedMs: 1_250,
    engineRecovered: true,
    retryCount: 1,
    workerRestartCount: 0,
    outcome: 'success',
  });
  assert.deepEqual(properties, {
    search_type: 'ticket',
    calculation_mode: 'normal',
    capability: 'ticket',
    elapsed_bucket: '1s_3s',
    engine_recovered: true,
    retry_count: 1,
    worker_restart_count: 0,
    outcome: 'success',
  });
  for (const forbidden of ['from_station', 'to_station', 'route', 'no_split_stations', 'fare', 'saved_amount', 'error_message', 'search_id', 'url']) {
    assert.equal(Object.hasOwn(properties, forbidden), false);
  }
});

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
  assert.match(capturedRequest.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  assert.deepEqual(capturedOptions.cf, {
    cacheEverything: true,
    cacheTtlByStatus: { '200-299': 2592000, '300-599': 0 },
  });
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=0, s-maxage=2592000');
  assert.equal(response.headers.get('X-Request-ID'), capturedRequest.headers.get('x-request-id'));
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

test('Sentry tunnel only accepts POST', async () => {
  const response = await proxySentry(new Request('https://kippu-navi.com/monitoring'), sentryDsn);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('Sentry tunnel rejects oversized envelopes before forwarding', async () => {
  const response = await proxySentry(new Request('https://kippu-navi.com/monitoring', {
    method: 'POST',
    headers: { 'Content-Length': String(201 * 1024) },
    body: sentryEnvelope(sentryDsn),
  }), sentryDsn);
  assert.equal(response.status, 413);
});

test('Sentry tunnel rejects an envelope for another DSN', async () => {
  const response = await proxySentry(new Request('https://kippu-navi.com/monitoring', {
    method: 'POST',
    body: sentryEnvelope('https://other@o999.ingest.sentry.io/999'),
  }), sentryDsn);
  assert.equal(response.status, 403);
});

test('Sentry tunnel forwards a valid envelope to its fixed project endpoint', async t => {
  const originalFetch = globalThis.fetch;
  let capturedUrl;
  let capturedBody;
  globalThis.fetch = async (url, options) => {
    capturedUrl = url.toString();
    capturedBody = await new Response(options.body).text();
    return new Response(null, { status: 200 });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const envelope = sentryEnvelope(sentryDsn);
  const response = await proxySentry(new Request('https://kippu-navi.com/monitoring', {
    method: 'POST',
    body: envelope,
  }), sentryDsn);

  assert.equal(response.status, 200);
  assert.equal(capturedUrl, 'https://o123.ingest.sentry.io/api/456/envelope/');
  assert.equal(capturedBody, envelope);
});
