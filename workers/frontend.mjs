const API_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60;

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
  originRequest.headers.delete('host');
  originRequest.headers.delete('cookie');
  originRequest.headers.delete('authorization');
  originRequest.headers.delete('cache-control');
  originRequest.headers.delete('pragma');
  if (!normalizedUrl) return fetch(originRequest);

  const originResponse = await fetch(originRequest, {
    cf: {
      cacheEverything: true,
      cacheTtlByStatus: {
        '200-299': API_CACHE_TTL_SECONDS,
        '300-599': 0,
      },
    },
  });
  const response = new Response(originResponse.body, originResponse);
  response.headers.set('Cache-Control', originResponse.ok
    ? `public, max-age=0, s-maxage=${API_CACHE_TTL_SECONDS}`
    : 'no-store');
  return response;
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
    if (url.pathname.startsWith('/ingest/')) {
      return proxyPostHog(request);
    }
    if (url.pathname.startsWith('/api/')) {
      return proxyApi(request, env.API_ORIGIN);
    }
    return env.ASSETS.fetch(request);
  },
};
