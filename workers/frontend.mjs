const API_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const SENTRY_MAX_ENVELOPE_BYTES = 200 * 1024;
const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const GOOGLE_TOKEN_LIFETIME_SECONDS = 60 * 60;
const GOOGLE_TOKEN_REFRESH_MARGIN_SECONDS = 5 * 60;
const ENGINE_ASSET_PATTERN = /^\/engine\/([a-f0-9]{64})\/(main\.wasm|pass_graph_data\.bin|ticket_graph_data\.bin|wasm_exec\.js)$/;

const googleIdTokenCache = new Map();

const cacheableApiParameters = {
  '/api/split-pass': ['from', 'to', 'months', 'maxSplits', 'noSplitStation'],
  '/api/split-icpass': ['from', 'to', 'months', 'noSplitStation'],
  '/api/split-ticket': ['from', 'to', 'maxSplits', 'noSplitStation'],
};

export function normalizeCacheableApiUrl(url) {
  const allowedParameters = cacheableApiParameters[url.pathname];
  if (!allowedParameters) return null;

  const normalized = new URL(url.origin);
  normalized.pathname = url.pathname;
  for (const name of allowedParameters) {
    let values = url.searchParams.getAll(name);
    if (name === 'noSplitStation') {
      values = [...new Set(values.map(value => value.trim()).filter(Boolean))].sort();
    }
    for (const value of values) normalized.searchParams.append(name, value);
  }
  return normalized;
}

function encodeBase64Url(value) {
  const bytes = typeof value === 'string'
    ? new TextEncoder().encode(value)
    : new Uint8Array(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decodeBase64Url(value) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
}

function privateKeyBytes(privateKey) {
  const body = privateKey
    .replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  if (!body) throw new Error('Invalid service account private key.');
  return Uint8Array.from(atob(body), character => character.charCodeAt(0));
}

async function createServiceAccountAssertion(email, privateKey, audience, nowSeconds) {
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = encodeBase64Url(JSON.stringify({
    iss: email,
    sub: email,
    aud: GOOGLE_TOKEN_ENDPOINT,
    iat: nowSeconds,
    exp: nowSeconds + GOOGLE_TOKEN_LIFETIME_SECONDS,
    target_audience: audience,
  }));
  const unsignedToken = `${header}.${claims}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    privateKeyBytes(privateKey),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsignedToken),
  );
  return `${unsignedToken}.${encodeBase64Url(signature)}`;
}

function tokenExpiry(idToken) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('Google returned an invalid ID token.');
  const payload = JSON.parse(new TextDecoder().decode(decodeBase64Url(parts[1])));
  if (!Number.isFinite(payload.exp)) throw new Error('Google ID token has no expiry.');
  return payload.exp;
}

export async function fetchGoogleIdToken(credentials, fetchImpl = fetch, now = Date.now()) {
  const nowSeconds = Math.floor(now / 1000);
  const assertion = await createServiceAccountAssertion(
    credentials.email,
    credentials.privateKey,
    credentials.audience,
    nowSeconds,
  );
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  });
  if (!response.ok) throw new Error(`Google ID token exchange failed with status ${response.status}.`);
  const body = await response.json();
  if (typeof body.id_token !== 'string') throw new Error('Google ID token response is invalid.');
  return { token: body.id_token, expiresAt: tokenExpiry(body.id_token) };
}

export async function getGoogleIdToken(credentials, now = Date.now()) {
  const cacheKey = `${credentials.email}\n${credentials.audience}`;
  const nowSeconds = Math.floor(now / 1000);
  const cached = googleIdTokenCache.get(cacheKey);
  if (cached?.token && cached.expiresAt - GOOGLE_TOKEN_REFRESH_MARGIN_SECONDS > nowSeconds) {
    return cached.token;
  }
  if (cached?.pending) return cached.pending;

  const pending = fetchGoogleIdToken(credentials, fetch, now)
    .then(result => {
      googleIdTokenCache.set(cacheKey, result);
      return result.token;
    })
    .catch(error => {
      googleIdTokenCache.delete(cacheKey);
      throw error;
    });
  googleIdTokenCache.set(cacheKey, { pending });
  return pending;
}

export function clearGoogleIdTokenCache() {
  googleIdTokenCache.clear();
}

function googleCredentials(env) {
  if (!env.API_ORIGIN || !env.GCP_SERVICE_ACCOUNT_EMAIL || !env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return null;
  }
  return {
    audience: env.API_ORIGIN,
    email: env.GCP_SERVICE_ACCOUNT_EMAIL,
    privateKey: env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY,
  };
}

export async function proxyApi(request, apiOrigin, credentials, tokenProvider = getGoogleIdToken) {
  if (!apiOrigin || !credentials) {
    return new Response('API origin authentication is not configured.', { status: 503 });
  }

  const incomingUrl = new URL(request.url);
  const normalizedUrl = request.method === 'GET'
    ? normalizeCacheableApiUrl(incomingUrl)
    : null;
  const requestUrl = normalizedUrl ?? incomingUrl;
  const targetUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, apiOrigin);
  const originRequest = new Request(targetUrl, request);
  const requestId = request.headers.get('X-Request-ID') || crypto.randomUUID();
  const startedAt = performance.now();
  originRequest.headers.delete('host');
  originRequest.headers.delete('cookie');
  originRequest.headers.delete('authorization');
  originRequest.headers.delete('cache-control');
  originRequest.headers.delete('pragma');
  originRequest.headers.set('X-Request-ID', requestId);
  let originResponse;
  try {
    const idToken = await tokenProvider(credentials);
    originRequest.headers.set('Authorization', `Bearer ${idToken}`);
    originResponse = normalizedUrl
      ? await fetch(originRequest, {
          cf: {
            cacheEverything: true,
            cacheTtlByStatus: {
              '200-299': API_CACHE_TTL_SECONDS,
              '300-599': 0,
            },
          },
        })
      : await fetch(originRequest);
  } catch (error) {
    console.error(JSON.stringify({ event: 'api_proxy_failed', request_id: requestId, path: incomingUrl.pathname, elapsed_ms: Math.round(performance.now() - startedAt), error_name: error instanceof Error ? error.name : 'Error' }));
    return new Response('Upstream API request failed.', { status: 502, headers: { 'Cache-Control': 'no-store', 'X-Request-ID': requestId } });
  }

  const response = new Response(originResponse.body, originResponse);
  response.headers.set('X-Request-ID', requestId);
  response.headers.set('Cache-Control', originResponse.ok
    ? normalizedUrl ? `public, max-age=0, s-maxage=${API_CACHE_TTL_SECONDS}` : (originResponse.headers.get('Cache-Control') || 'no-store')
    : 'no-store');
  console.log(JSON.stringify({ event: 'api_proxy_completed', request_id: requestId, path: incomingUrl.pathname, status: originResponse.status, elapsed_ms: Math.round(performance.now() - startedAt), cache_status: originResponse.headers.get('CF-Cache-Status') || 'unknown' }));
  return response;
}

function sentryEndpoint(dsn) {
  const parsed = new URL(dsn);
  const projectId = parsed.pathname.replace(/^\/+|\/+$/g, '');
  if (parsed.protocol !== 'https:' || !parsed.username || !projectId || parsed.password) return null;
  return new URL(`/api/${projectId}/envelope/`, parsed.origin);
}

export async function proxySentry(request, configuredDsn) {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } });
  const endpoint = configuredDsn ? sentryEndpoint(configuredDsn) : null;
  if (!endpoint) return new Response('Sentry is not configured.', { status: 503 });
  const declaredSize = Number(request.headers.get('Content-Length') || 0);
  if (declaredSize > SENTRY_MAX_ENVELOPE_BYTES) return new Response('Payload Too Large', { status: 413 });

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) return new Response('Invalid envelope.', { status: 400 });
  if (body.byteLength > SENTRY_MAX_ENVELOPE_BYTES) return new Response('Payload Too Large', { status: 413 });
  const firstLineEnd = new Uint8Array(body).indexOf(10);
  if (firstLineEnd < 1) return new Response('Invalid envelope.', { status: 400 });
  let header;
  try {
    header = JSON.parse(new TextDecoder().decode(body.slice(0, firstLineEnd)));
  } catch {
    return new Response('Invalid envelope.', { status: 400 });
  }
  if (header.dsn !== configuredDsn) return new Response('Invalid DSN.', { status: 403 });

  const headers = new Headers({ 'Content-Type': request.headers.get('Content-Type') || 'application/x-sentry-envelope' });
  return fetch(endpoint, { method: 'POST', headers, body });
}

export async function fetchEngineAsset(request, assets) {
  const url = new URL(request.url);
  const match = ENGINE_ASSET_PATTERN.exec(url.pathname);
  if (!match || !['GET', 'HEAD'].includes(request.method)) return assets.fetch(request);

  const response = await assets.fetch(request);
  if (response.status !== 404) return response;

  try {
    const manifestUrl = new URL('/deployment.json', url);
    const manifestResponse = await assets.fetch(new Request(manifestUrl, {
      method: 'GET',
      headers: request.headers,
    }));
    if (!manifestResponse.ok) return response;

    const manifest = await manifestResponse.json();
    if (typeof manifest.enginePath !== 'string') return response;

    const engineUrl = new URL(manifest.enginePath, manifestUrl);
    if (engineUrl.origin !== url.origin || !/^\/engine\/[a-f0-9]{64}$/.test(engineUrl.pathname)) return response;
    if (engineUrl.pathname === `/engine/${match[1]}`) return response;

    const fallbackUrl = new URL(`${engineUrl.pathname}/${match[2]}`, url);
    fallbackUrl.search = url.search;
    return assets.fetch(new Request(fallbackUrl, request));
  } catch {
    // Keep the original 404 if the deployment manifest is unavailable or invalid.
    return response;
  }
}

function proxyPostHog(request) {
  const incomingUrl = new URL(request.url);
  const isAssetRequest =
    incomingUrl.pathname.startsWith('/ingest/static/') ||
    incomingUrl.pathname.startsWith('/ingest/array/');
  const targetOrigin = isAssetRequest
    ? 'https://us-assets.i.posthog.com'
    : 'https://us.i.posthog.com';
  const proxyPath = incomingUrl.pathname.slice('/ingest'.length);
  const targetUrl = new URL(`${proxyPath}${incomingUrl.search}`, targetOrigin);
  const proxyRequest = new Request(targetUrl, request);
  proxyRequest.headers.delete('host');
  proxyRequest.headers.delete('cookie');
  proxyRequest.headers.delete('authorization');

  const clientIp = request.headers.get('CF-Connecting-IP');
  if (clientIp) {
    proxyRequest.headers.set('X-Forwarded-For', clientIp);
  }

  return fetch(proxyRequest);
}

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/monitoring') {
      return proxySentry(request, env.SENTRY_DSN);
    }
    if (url.pathname.startsWith('/ingest/')) {
      return proxyPostHog(request);
    }
    if (url.pathname.startsWith('/api/')) {
      return proxyApi(request, env.API_ORIGIN, googleCredentials(env));
    }
    return fetchEngineAsset(request, env.ASSETS);
  },
};
