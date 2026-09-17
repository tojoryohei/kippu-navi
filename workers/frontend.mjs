function proxyApi(request, apiOrigin) {
  if (!apiOrigin) {
    return new Response('API origin is not configured.', { status: 503 });
  }

  const incomingUrl = new URL(request.url);
  const targetUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, apiOrigin);
  const headers = new Headers(request.headers);
  headers.delete('host');

  return fetch(new Request(targetUrl, {
    method: request.method,
    headers,
    body: request.body,
    redirect: 'manual',
  }));
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
