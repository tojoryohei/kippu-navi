import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/* eslint-disable security/detect-non-literal-fs-filename -- このテストが作成した一時ディレクトリと固定の資材名だけを扱う。 */

// 配信側と同じく、一致したルールのヘッダーをすべて継承する。
function cacheControl(headers, path) {
  let matches = false;
  const values = [];
  for (const line of headers.split('\n')) {
    if (line.startsWith('/')) {
      const pattern = line.trim();
      matches = pattern.endsWith('*') ? path.startsWith(pattern.slice(0, -1)) : path === pattern;
    } else if (matches && line.trim().toLowerCase().startsWith('cache-control:')) {
      values.push(line.trim().slice('cache-control:'.length).trim());
    }
  }
  return values.join(', ');
}

test('PWAのHTMLだけ変換を禁止し、ハッシュ付き資材には圧縮禁止を継承させない', () => {
  const directory = mkdtempSync(join(tmpdir(), 'kippu-pwa-headers-'));
  try {
    mkdirSync(join(directory, 'scripts'));
    mkdirSync(join(directory, 'src/pwa'), { recursive: true });
    mkdirSync(join(directory, 'dist/_astro'), { recursive: true });
    mkdirSync(join(directory, 'dist/fare'), { recursive: true });
    mkdirSync(join(directory, 'dist/articles'), { recursive: true });
    cpSync('scripts/build-pwa.mjs', join(directory, 'scripts/build-pwa.mjs'));
    cpSync('src/pwa/service-worker.js', join(directory, 'src/pwa/service-worker.js'));
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ version: 'test' }));
    writeFileSync(join(directory, 'dist/_headers'), readFileSync('public/_headers', 'utf8') + '\n/engine/*\n  Cache-Control: public, max-age=31536000, immutable\n');
    const fixtures = new Map([
      ['index.html', '<html>ホーム</html>'],
      ['fare/ticket.html', '<html>運賃計算</html>'],
      ['articles/new-post.html', '<html>追加記事</html>'],
      ['_astro/app.css', 'body { color: black; }'],
      ['_astro/app.js', 'console.log("test");'],
    ]);
    for (const [name, body] of fixtures) writeFileSync(join(directory, 'dist', name), body);
    const run = () => execFileSync(process.execPath, [join(directory, 'scripts/build-pwa.mjs')], { stdio: 'pipe' });
    run();
    const headers = readFileSync(join(directory, 'dist/_headers'), 'utf8');
    for (const path of ['/', '/fare/ticket', '/articles/new-post']) assert.equal(cacheControl(headers, path), 'no-cache, no-transform');
    for (const path of ['/_astro/app.css', '/_astro/app.js', '/engine/version/main.wasm']) {
      assert.equal(cacheControl(headers, path), 'no-cache, public, max-age=31536000, immutable');
    }
    assert.match(cacheControl(headers, '/sw.js'), /no-transform/);
    const manifest = JSON.parse(readFileSync(join(directory, 'dist/pwa-assets.json'), 'utf8'));
    assert.equal(manifest.assets.length, fixtures.size);
    for (const asset of manifest.assets) {
      const name = asset.url === '/' ? 'index.html' : /\.(css|js)$/.test(asset.url) ? asset.url.slice(1) : `${asset.url.slice(1)}.html`;
      assert.equal(asset.sha256, createHash('sha256').update(fixtures.get(name)).digest('hex'));
    }
    // 再生成してもHTMLルールが重複しない。
    run();
    assert.equal(readFileSync(join(directory, 'dist/_headers'), 'utf8'), headers);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
