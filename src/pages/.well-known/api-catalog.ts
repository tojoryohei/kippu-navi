import { openapi } from "@/lib/public-api";

const origin = "https://kippu-navi.com";
const catalogUrl = `${origin}/.well-known/api-catalog`;
const contentType = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';

export function GET() {
  const endpoints = Object.keys(openapi.paths).map(path => `${origin}${path}`);
  return new Response(JSON.stringify({
    linkset: [
      { anchor: catalogUrl, item: endpoints.map(href => ({ href })) },
      ...endpoints.map(anchor => ({
        anchor,
        "service-desc": [{ href: `${origin}/openapi.json`, type: "application/json" }],
        "service-doc": [{ href: `${origin}/developers/api`, type: "text/html" }],
      })),
    ],
  }), {
    headers: {
      "Content-Type": contentType,
      Link: `<${catalogUrl}>; rel="api-catalog"; type="application/linkset+json"`,
    },
  });
}
