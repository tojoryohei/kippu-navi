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

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      return proxyApi(request, env.API_ORIGIN);
    }
    return env.ASSETS.fetch(request);
  },
};
