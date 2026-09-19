import assert from 'node:assert/strict';
import test from 'node:test';

import {
  clearGoogleIdTokenCache,
  fetchGoogleIdToken,
  getGoogleIdToken,
  normalizeCacheableApiUrl,
  proxyApi,
  proxySentry,
} from '../../workers/frontend.mjs';
import { buildSearchCompletedProperties, buildSearchUrl } from '../../src/lib/analytics-events.ts';
import { classifyCalculationError } from '../../src/lib/search-errors.ts';

const sentryDsn = 'https://public-key@o123.ingest.sentry.io/456';
const sentryEnvelope = dsn => `${JSON.stringify({ dsn })}\n${JSON.stringify({ type: 'event' })}\n{}`;
const googleCredentials = {
  audience: 'https://calculation-engine.example.com',
  email: 'cloudflare@example.iam.gserviceaccount.com',
  privateKey: 'unused by the injected token provider',
};
const testTokenProvider = async () => 'google-id-token';

function encodeTestJwt(payload) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256' })}.${encode(payload)}.signature`;
}

async function generatePrivateKeyPem() {
  const pair = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const bytes = Buffer.from(await crypto.subtle.exportKey('pkcs8', pair.privateKey));
  const lines = bytes.toString('base64').match(/.{1,64}/g);
  return `-----BEGIN PRIVATE KEY-----\n${lines.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

test('calculation errors distinguish business errors from system failures', () => {
  assert.equal(classifyCalculationError('経路が重複しています。'), 'duplicate_route');
  assert.equal(classifyCalculationError('再考：要求区間誤り'), 'path_invalid');
  assert.equal(classifyCalculationError('unexpected failure'), 'calculation_failed');
});

test('PostHog fare search payload contains route, URL, and exact result values', () => {
  const properties = buildSearchCompletedProperties({
    searchType: 'ticket',
    calculationMode: 'normal',
    capability: 'ticket',
    elapsedMs: 1_250,
    engineRecovered: true,
    retryCount: 1,
    workerRestartCount: 0,
    outcome: 'success',
    search: {
      searchSurface: 'fare',
      searchUrl: 'https://kippu-navi.com/fare/ticket?route=A-B&campaign=autumn',
      originStation: 'A',
      destinationStation: 'B',
      routeStations: ['A', 'C', 'B'],
      routeLines: ['X線', 'Y線'],
    },
    result: { totalFareYen: 1_460, distanceKm: 42.7 },
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
    $current_url: 'https://kippu-navi.com/fare/ticket?route=A-B&campaign=autumn',
    search_surface: 'fare',
    search_url: 'https://kippu-navi.com/fare/ticket?route=A-B&campaign=autumn',
    origin_station: 'A',
    destination_station: 'B',
    route_stations: ['A', 'C', 'B'],
    route_lines: ['X線', 'Y線'],
    total_fare_yen: 1_460,
    distance_km: 42.7,
  });
  for (const forbidden of ['error_message', 'search_id']) {
    assert.equal(Object.hasOwn(properties, forbidden), false);
  }
});

test('PostHog split search payload contains split settings and savings', () => {
  const properties = buildSearchCompletedProperties({
    searchType: 'pass3',
    capability: 'pass',
    elapsedMs: 320,
    engineRecovered: false,
    retryCount: 0,
    workerRestartCount: 0,
    outcome: 'success',
    search: {
      searchSurface: 'split',
      searchUrl: 'https://kippu-navi.com/split/pass?from=A&to=B&month=3&maxSplits=2',
      originStation: 'A',
      destinationStation: 'B',
      routeStations: ['A', 'B'],
      months: 3,
      maxSplits: 2,
      noSplitStations: ['C'],
      isIc: false,
    },
    result: {
      normalFareYen: 30_000,
      bestFareYen: 24_000,
      savingsYen: 6_000,
      bestSplitCount: 2,
      candidateCount: 4,
    },
  });
  assert.equal(properties.months, 3);
  assert.equal(properties.max_splits, 2);
  assert.deepEqual(properties.no_split_stations, ['C']);
  assert.equal(properties.normal_fare_yen, 30_000);
  assert.equal(properties.best_fare_yen, 24_000);
  assert.equal(properties.savings_yen, 6_000);
  assert.equal(properties.best_split_count, 2);
  assert.equal(properties.candidate_count, 4);
});

test('PostHog business errors retain search details without result fields', () => {
  const properties = buildSearchCompletedProperties({
    searchType: 'ticket',
    capability: 'ticket',
    elapsedMs: 20,
    engineRecovered: false,
    retryCount: 0,
    workerRestartCount: 0,
    outcome: 'business_error',
    errorCode: 'path_invalid',
    search: {
      searchSurface: 'fare',
      searchUrl: 'https://kippu-navi.com/fare/ticket?route=A-A',
      originStation: 'A',
      destinationStation: 'A',
      routeStations: ['A', 'A'],
    },
  });
  assert.equal(properties.error_code, 'path_invalid');
  assert.equal(properties.outcome, 'business_error');
  assert.equal(properties.$current_url, 'https://kippu-navi.com/fare/ticket?route=A-A');
  assert.equal(Object.hasOwn(properties, 'total_fare_yen'), false);
});

test('search URL is absolute, keeps all query parameters, and excludes hash', () => {
  const location = new URL('https://kippu-navi.com/fare/ticket?route=A-B&campaign=autumn#result');
  assert.equal(
    buildSearchUrl(location),
    'https://kippu-navi.com/fare/ticket?route=A-B&campaign=autumn',
  );
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
  ), 'https://calculation-engine.example.com', googleCredentials, testTokenProvider);

  assert.equal(capturedRequest.url, 'https://calculation-engine.example.com/api/split-ticket?from=A&to=B');
  assert.equal(capturedRequest.headers.get('authorization'), 'Bearer google-id-token');
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
  }), 'https://calculation-engine.example.com', googleCredentials, testTokenProvider);

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
  ), 'https://calculation-engine.example.com', googleCredentials, testTokenProvider);

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('Google token exchange signs the expected service account assertion', async () => {
  const privateKey = await generatePrivateKeyPem();
  let request;
  const idToken = encodeTestJwt({ exp: 4_600 });
  const result = await fetchGoogleIdToken(
    { ...googleCredentials, privateKey },
    async (url, options) => {
      request = { url, options };
      return Response.json({ id_token: idToken });
    },
    1_000_000,
  );

  assert.equal(request.url, 'https://oauth2.googleapis.com/token');
  assert.equal(request.options.method, 'POST');
  const form = new URLSearchParams(request.options.body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const assertionParts = form.get('assertion').split('.');
  const claims = JSON.parse(Buffer.from(assertionParts[1], 'base64url').toString());
  assert.equal(claims.iss, googleCredentials.email);
  assert.equal(claims.sub, googleCredentials.email);
  assert.equal(claims.aud, 'https://oauth2.googleapis.com/token');
  assert.equal(claims.target_audience, googleCredentials.audience);
  assert.equal(claims.iat, 1_000);
  assert.equal(claims.exp, 4_600);
  assert.equal(result.token, idToken);
  assert.equal(result.expiresAt, 4_600);
});

test('Google ID token is cached until its refresh window', async t => {
  const originalFetch = globalThis.fetch;
  const privateKey = await generatePrivateKeyPem();
  const credentials = { ...googleCredentials, privateKey };
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return Response.json({ id_token: encodeTestJwt({ exp: calls === 1 ? 4_600 : 8_200 }) });
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
    clearGoogleIdTokenCache();
  });
  clearGoogleIdTokenCache();

  const first = await getGoogleIdToken(credentials, 1_000_000);
  const cached = await getGoogleIdToken(credentials, 4_000_000);
  const refreshed = await getGoogleIdToken(credentials, 4_301_000);

  assert.equal(first, cached);
  assert.notEqual(first, refreshed);
  assert.equal(calls, 2);
});

test('API proxy returns 502 without calling the origin when token exchange fails', async t => {
  const originalFetch = globalThis.fetch;
  let originCalls = 0;
  globalThis.fetch = async () => {
    originCalls += 1;
    return Response.json({ ok: true });
  };
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await proxyApi(
    new Request('https://kippu-navi.com/api/fare'),
    'https://calculation-engine.example.com',
    googleCredentials,
    async () => { throw new Error('token exchange failed'); },
  );

  assert.equal(response.status, 502);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(originCalls, 0);
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
