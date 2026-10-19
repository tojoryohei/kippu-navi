import assert from 'node:assert/strict';
import test from 'node:test';

import frontend, {
  clearGoogleIdTokenCache,
  fetchEngineAsset,
  fetchGoogleIdToken,
  getGoogleIdToken,
  normalizeCacheableApiUrl,
  proxyApi,
  proxySentry,
} from '../../workers/frontend.mjs';
import { buildSearchCompletedProperties, buildSearchUrl } from '../../src/lib/analytics-events.ts';
import { classifyCalculationError, isBusinessSearchError, isRetryableEngineError, normalizeCalculationError, SearchOperationError } from '../../src/lib/search-errors.ts';

const sentryDsn = 'https://public-key@o123.ingest.sentry.io/456';

test('stagingの静的資材とWorker生成応答はすべて検索対象外にする', async () => {
  for (const [host, environment, excluded] of [
    ['staging.kippu-navi.com', undefined, true],
    ['preview.example.workers.dev', 'staging', true],
    ['kippu-navi.com', 'production', false],
  ]) {
    for (const [path, status] of [['/', 200], ['/api/split/auto/ticket', 503], ['/monitoring', 405], ['/manifest.webmanifest', 200]]) {
      const response = await frontend.fetch(new Request(`https://${host}${path}`), {
        DEPLOY_ENVIRONMENT: environment,
        ASSETS: { fetch: async () => new Response('静的資材') },
      });
      assert.equal(response.status, status);
      assert.equal(response.headers.get('X-Robots-Tag'), excluded ? 'noindex, nofollow' : null);
      if (path === '/') assert.equal(await response.text(), '静的資材');
    }
  }
});

test('staging APIの成功・入力エラー応答にもnoindexを付け、本番には付けない', async t => {
  const originalFetch = globalThis.fetch;
  const privateKey = await generatePrivateKeyPem();
  t.after(() => { globalThis.fetch = originalFetch; clearGoogleIdTokenCache(); });
  clearGoogleIdTokenCache();
  for (const environment of ['staging', 'production']) {
    for (const status of [200, 400]) {
      globalThis.fetch = async input => typeof input === 'string'
        ? Response.json({ id_token: encodeTestJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }) })
        : Response.json({ status }, { status });
      const response = await frontend.fetch(new Request('https://example.com/api/split/auto/ticket'), {
        DEPLOY_ENVIRONMENT: environment,
        API_ORIGIN: googleCredentials.audience,
        GCP_SERVICE_ACCOUNT_EMAIL: googleCredentials.email,
        GCP_SERVICE_ACCOUNT_PRIVATE_KEY: privateKey,
      });
      assert.equal(response.status, status);
      assert.deepEqual(await response.json(), { status });
      assert.equal(response.headers.get('X-Robots-Tag'), environment === 'staging' ? 'noindex, nofollow' : null);
    }
  }
});
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

test('計算エラーは業務上のエラーとシステム障害を区別する', () => {
  assert.equal(classifyCalculationError('経路が重複しています。'), 'duplicate_route');
  assert.equal(classifyCalculationError('再考：要求区間誤り'), 'path_invalid');
  assert.equal(classifyCalculationError('指定された区間はJR在来線のみで繋がっていません。', 422), 'path_invalid');
  assert.equal(classifyCalculationError('経路が見つかりませんでした'), 'path_invalid');
  assert.equal(normalizeCalculationError('経路が見つかりませんでした'), '指定された区間はJR在来線のみで繋がっていません。経路入力検索を利用してください。');
  assert.equal(classifyCalculationError('unexpected failure'), 'calculation_failed');
});

test('経路APIの429は業務エラーとし、他のHTTP障害は通知対象に残す', () => {
  const details = {
    message: '経路APIがエラーを返しました (429)',
    code: 'api_http_failed', source: 'api', stage: 'api_fetch',
    retryable: true, retryCount: 0, workerRestartCount: 0,
  };
  assert.equal(isBusinessSearchError({ ...details, httpStatus: 429 }), true);
  for (const httpStatus of [400, 403, 408, 500, 502, 503]) {
    assert.equal(isBusinessSearchError({ ...details, httpStatus }), false);
  }
  for (const code of ['duplicate_route', 'path_invalid', 'fare_unregistered']) {
    assert.equal(isBusinessSearchError({ ...details, code }), true);
  }
});

test('再試行可能なエンジン初期化失敗は画面操作で復旧できる', () => {
  const baseDetails = {
    message: 'engine failed',
    code: 'engine_initialization_timeout',
    source: 'client',
    stage: 'worker_bootstrap',
    exceptionName: 'Error',
    retryCount: 0,
    workerRestartCount: 0,
    retryable: true,
  };

  assert.equal(isRetryableEngineError(new SearchOperationError(baseDetails)), true);
  assert.equal(isRetryableEngineError(new SearchOperationError({
    ...baseDetails,
    code: 'worker_runtime_failed',
    source: 'worker',
    exceptionName: 'ErrorEvent',
  })), true);
  assert.equal(isRetryableEngineError(new SearchOperationError({
    ...baseDetails,
    code: 'engine_asset_fetch_failed',
    stage: 'wasm_fetch',
    httpStatus: 404,
    retryable: false,
  })), false);
  assert.equal(isRetryableEngineError(new SearchOperationError({
    ...baseDetails,
    code: 'calculation_failed',
    stage: 'calculation',
  })), false);
});

test('PostHogの運賃検索データは経路、URL、正確な計算結果を含む', () => {
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

test('PostHogの分割検索データは分割条件と節約額を含む', () => {
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
      searchUrl: 'https://kippu-navi.com/split/auto/pass?from=A&to=B&months=3&maxSplits=2',
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

test('PostHogの業務上のエラーは計算結果を含めず検索条件を保持する', () => {
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
  assert.equal(Object.hasOwn(properties, 'total_fare_yen'), false);
});

test('検索URLは絶対URLで全クエリパラメーターを保持し、ハッシュを除外する', () => {
  const location = new URL('https://kippu-navi.com/fare/ticket?route=A-B&campaign=autumn#result');
  assert.equal(
    buildSearchUrl(location),
    'https://kippu-navi.com/fare/ticket?route=A-B&campaign=autumn',
  );
});

test('キャッシュ可能なAPIのクエリは許可項目だけを残して正規化する', () => {
  const normalized = normalizeCacheableApiUrl(new URL(
    'https://kippu-navi.com/api/split/auto/pass?to=B&ignored=x&noSplitStation=Z&from=A&noSplitStation=%20Y%20&noSplitStation=Z&noSplitStation=&noSplitStation=%20&months=3',
  ));
  assert.equal(
    normalized?.toString(),
    'https://kippu-navi.com/api/split/auto/pass?from=A&to=B&months=3&noSplitStation=Y&noSplitStation=Z',
  );
});

test('キャッシュ対象外のAPIパスは正規化しない', () => {
  assert.equal(normalizeCacheableApiUrl(new URL('https://kippu-navi.com/api/fare')), null);
});

test('キャッシュ可能なGETは機密情報とキャッシュ回避ヘッダーを除去し、エッジキャッシュを適用する', async t => {
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
    'https://kippu-navi.com/api/split/auto/ticket?to=B&from=A',
    {
      headers: {
        Authorization: 'Bearer secret',
        Cookie: 'session=secret',
        'Cache-Control': 'no-cache',
        Pragma: 'no-cache',
      },
    },
  ), 'https://calculation-engine.example.com', googleCredentials, testTokenProvider);

  assert.equal(capturedRequest.url, 'https://calculation-engine.example.com/api/split/auto/ticket?from=A&to=B');
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

test('POSTリクエストでは共有キャッシュを有効にしない', async t => {
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

test('失敗したGETレスポンスはキャッシュ可能として返さない', async t => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json(
    { error: 'bad request' },
    { status: 400, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
  t.after(() => { globalThis.fetch = originalFetch; });

  const response = await proxyApi(new Request(
    'https://kippu-navi.com/api/split/auto/ticket?from=A&to=A',
  ), 'https://calculation-engine.example.com', googleCredentials, testTokenProvider);

  assert.equal(response.status, 400);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});

test('Googleのトークン交換では想定したサービスアカウントのアサーションに署名する', async () => {
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

test('Google IDトークンは更新時期までキャッシュする', async t => {
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

test('APIプロキシはトークン交換に失敗するとオリジンを呼び出さず502を返す', async t => {
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

test('SentryトンネルはPOSTだけを受け付ける', async () => {
  const response = await proxySentry(new Request('https://kippu-navi.com/monitoring'), sentryDsn);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('Sentryトンネルはサイズ上限を超えたエンベロープを転送前に拒否する', async () => {
  const response = await proxySentry(new Request('https://kippu-navi.com/monitoring', {
    method: 'POST',
    headers: { 'Content-Length': String(201 * 1024) },
    body: sentryEnvelope(sentryDsn),
  }), sentryDsn);
  assert.equal(response.status, 413);
});

test('Sentryトンネルは別のDSN宛てのエンベロープを拒否する', async () => {
  const response = await proxySentry(new Request('https://kippu-navi.com/monitoring', {
    method: 'POST',
    body: sentryEnvelope('https://other@o999.ingest.sentry.io/999'),
  }), sentryDsn);
  assert.equal(response.status, 403);
});

test('Sentryトンネルは有効なエンベロープを固定のプロジェクトエンドポイントへ転送する', async t => {
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

for (const staleStatus of [403, 404]) test(`古いエンジン資材のパスはHTTP ${staleStatus}の後に現行版へフォールバックする`, async () => {
  const staleUrl = 'https://kippu-navi.com/engine/' + 'a'.repeat(64) + '/main.wasm';
  const currentPath = '/engine/' + 'b'.repeat(64);
  const requested = [];
  const assets = {
    fetch: async request => {
      const url = new URL(request.url);
      requested.push(url.pathname);
      if (url.pathname === staleUrl.replace('https://kippu-navi.com', '')) {
        return new Response('missing', { status: staleStatus });
      }
      if (url.pathname === '/deployment.json') {
        return Response.json({ enginePath: currentPath });
      }
      if (url.pathname === `${currentPath}/main.wasm`) {
        return new Response('wasm', { status: 200 });
      }
      return new Response('unexpected', { status: 404 });
    },
  };

  const response = await fetchEngineAsset(new Request(staleUrl), assets);

  assert.equal(response.status, 200);
  assert.deepEqual(requested, [
    `/engine/${'a'.repeat(64)}/main.wasm`,
    '/deployment.json',
    `${currentPath}/main.wasm`,
  ]);
});

test('現行エンジン資材のHTTP 403はそのまま返す', async () => {
  const currentPath = '/engine/' + 'b'.repeat(64);
  const requested = [];
  const assets = {
    fetch: async request => {
      const pathname = new URL(request.url).pathname;
      requested.push(pathname);
      if (pathname === '/deployment.json') return Response.json({ enginePath: currentPath });
      return new Response('forbidden', { status: 403 });
    },
  };

  const response = await fetchEngineAsset(new Request(`https://kippu-navi.com${currentPath}/main.wasm`), assets);

  assert.equal(response.status, 403);
  assert.deepEqual(requested, [`${currentPath}/main.wasm`, '/deployment.json']);
});

test('エンジン資材のフォールバックは配信情報にある外部URLを拒否する', async () => {
  const staleUrl = 'https://kippu-navi.com/engine/' + 'a'.repeat(64) + '/wasm_exec.js';
  let fallbackRequested = false;
  const assets = {
    fetch: async request => {
      const url = new URL(request.url);
      if (url.pathname.startsWith('/engine/')) return new Response('missing', { status: 404 });
      if (url.pathname === '/deployment.json') return Response.json({ enginePath: 'https://attacker.example/engine/' + 'b'.repeat(64) });
      fallbackRequested = true;
      return new Response('unexpected', { status: 500 });
    },
  };

  const response = await fetchEngineAsset(new Request(staleUrl), assets);

  assert.equal(response.status, 404);
  assert.equal(fallbackRequested, false);
});

test('staging検索はCDNキャッシュを使わずAPIのビルドSHAを保持する', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let options;
  globalThis.fetch = async (_request, init) => {
    options = init;
    return Response.json({ results: [] }, { headers: { 'X-Deployment-Commit': 'actual-build', 'Cache-Control': 'public, s-maxage=2592000' } });
  };
  const response = await proxyApi(new Request('https://staging.kippu-navi.com/api/split/auto/ticket?from=東京&to=品川'),
    googleCredentials.audience, googleCredentials, testTokenProvider, false);
  assert.deepEqual(options.cf, { cacheTtl: 0, cacheEverything: false });
  assert.equal(response.headers.get('X-Deployment-Commit'), 'actual-build');
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
});
