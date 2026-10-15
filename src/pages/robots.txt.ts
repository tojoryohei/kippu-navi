export function GET() {
  return new Response('User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/split-ticket\nAllow: /api/split-pass\nAllow: /api/split-icpass\n\nSitemap: https://kippu-navi.com/sitemap.xml\n', {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
