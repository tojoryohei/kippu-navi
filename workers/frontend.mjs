const API_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;
const SENTRY_MAX_ENVELOPE_BYTES = 200 * 1024;

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

export async function proxyApi(request, apiOrigin) {
  if (!apiOrigin) {
    return new Response('API origin is not configured.', { status: 503 });
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
      return proxyApi(request, env.API_ORIGIN);
    }
    return env.ASSETS.fetch(request);
  },
};
