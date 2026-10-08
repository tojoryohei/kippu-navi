import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
const assets = [];
function scan(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (relative === '404.html' || relative === 'sw.js') continue;
    if (entry.isDirectory()) { scan(join(directory, entry.name), `${relative}/`); continue; }
    if (!/\.(html|js|css|woff2|png|ico|svg|webp|jpg|jpeg|wasm|bin)$/.test(relative) && relative !== 'deployment.json' && !relative.startsWith('fonts/')) continue;
    const bytes = readFileSync(join(directory, entry.name));
    const url = relative === 'index.html' ? '/' : relative.endsWith('.html') ? '/' + relative.slice(0, -5) : '/' + relative;
    assets.push({ url, size: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
}
scan(dist.pathname);
assets.sort((a, b) => a.url.localeCompare(b.url));
const template = readFileSync(new URL('src/pwa/service-worker.js', root), 'utf8');
const version = createHash('sha256').update(JSON.stringify(assets)).update(template).digest('hex');
const config = { version, assets, bytes: assets.reduce((n, asset) => n + asset.size, 0) };
writeFileSync(new URL('sw.js', dist), `const RELEASE = ${JSON.stringify(config)};\n${template}`);
writeFileSync(new URL('pwa-assets.json', dist), JSON.stringify(config, null, 2));
const headersPath = new URL('_headers', dist);
const headers = readFileSync(headersPath, 'utf8').split('\n# Generated PWA headers')[0];
writeFileSync(headersPath, headers + '\n# Generated PWA headers' + '\n/sw.js\n  Cache-Control: no-cache, no-transform\n  Service-Worker-Allowed: /\n\n/pwa-assets.json\n  Cache-Control: no-store\n');
console.log(`PWA: ${assets.length} files, ${(config.bytes / 1024 / 1024).toFixed(2)} MiB, ${version.slice(0, 12)}`);
