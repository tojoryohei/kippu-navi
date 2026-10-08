// 静的ページだけを許可する。API・任意の外部URLは起動先にできない。
const pages = new Set(['/', '/guide', '/logic', '/articles', '/about', '/contact', '/privacy', '/changelog',
  '/fare/ticket', '/fare/pass', '/split/auto/ticket', '/split/auto/pass', '/split/auto/ic-pass',
  '/split/route/ticket', '/split/route/pass', '/articles/popular-routes', '/articles/how-to-buy-split-ticket',
  '/articles/how-to-buy-split-pass', '/articles/merit-demerit', '/articles/what-is-split-ticket', '/articles/jr-fare-system']);
const parameters = ['from', 'to', 'route', 'month', 'mode', 'maxSplits', 'noSplitStation'];
export function normalizeLaunch(raw, origin) {
  if (!raw || raw.length > 12000 || !raw.startsWith('/') || raw.startsWith('//')) return '/';
  const url = new URL(raw, origin);
  if (url.origin !== origin || !pages.has(url.pathname)) return '/';
  const params = new URLSearchParams();
  if (url.pathname.startsWith('/fare/') || url.pathname.startsWith('/split/')) {
    for (const name of parameters) {
      let values = url.searchParams.getAll(name).filter(value => value.length > 0 && value.length <= 4000);
      if (name === 'noSplitStation') values = [...new Set(values)].sort();
      else values = values.slice(0, 1);
      for (const value of values) params.append(name, value);
    }
  }
  return url.pathname + (params.size ? `?${params}` : '');
}
export function manifestResponse(request) {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  const url = new URL(request.url);
  const launch = normalizeLaunch(url.searchParams.get('launch'), url.origin);
  const body = { name: 'きっぷナビ', short_name: 'きっぷナビ', lang: 'ja', id: launch, start_url: launch,
    scope: '/', display: 'standalone', theme_color: '#155dfc', background_color: '#f8fafc',
    icons: [192, 512].map(size => ({ src: `/icons/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png', purpose: 'any' })) };
  return new Response(request.method === 'HEAD' ? null : JSON.stringify(body), {
    headers: { 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
  });
}
