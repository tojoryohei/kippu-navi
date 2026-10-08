// Astroの静的previewはユーザーのViteプラグインを除外するため、
// Workerのmanifestルートを含むローカル検証にはこちらを使う。
import { preview } from 'vite';
import { pwaManifestPlugin } from './pwa-vite-plugin.mjs';
const server = await preview({
  configFile: false, appType: 'mpa', build: { outDir: 'dist' },
  plugins: [pwaManifestPlugin(), {
    // 配信環境のCloudflareルールを再現。転送元をPWA保存対象に含めると失敗する。
    name: 'preview-legacy-ticket-redirect',
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        if (url.pathname !== '/split/ticket') return next();
        res.writeHead(301, { Location: `/split/auto/ticket${url.search}` });
        res.end();
      });
    },
  }],
  preview: { host: '127.0.0.1', port: 4321, strictPort: true },
});
server.printUrls();
