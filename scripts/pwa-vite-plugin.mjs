import { manifestResponse } from '../src/pwa/manifest.mjs';
export function pwaManifestPlugin() {
  const install = server => { server.middlewares.use(async (req, res, next) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/manifest.webmanifest') return next();
    const response = manifestResponse(new Request(new URL(req.url, 'http://localhost'), { method: req.method }));
    res.statusCode = response.status;
    response.headers.forEach((value, name) => res.setHeader(name, value));
    res.end(await response.text());
  }); };
  return { name: 'pwa-manifest', configureServer: install, configurePreviewServer: install };
}
