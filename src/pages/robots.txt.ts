export function GET() {
  if (import.meta.env.DEPLOY_ENVIRONMENT === 'staging') {
    // Googlebotにはnoindexを読ませ、それ以外のクローラーには全パスの取得拒否を案内する。
    return new Response('User-agent: *\nDisallow: /\n\nUser-agent: Googlebot\nAllow: /\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }
  return new Response('User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/split-ticket\nAllow: /api/split-pass\nAllow: /api/split-icpass\n\nSitemap: https://kippu-navi.com/sitemap.xml\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
