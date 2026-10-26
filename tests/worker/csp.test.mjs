/* eslint-disable security/detect-non-literal-fs-filename -- テスト専用の一時ディレクトリだけを扱う */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCsp, inlineHashes } from '../../scripts/build-csp.mjs';
const hash = value => `'sha256-${createHash('sha256').update(value).digest('base64')}'`;

test('実行可能なスクリプトだけを改行正規化してハッシュ化する', () => {
  const html = `<!-- <script>comment</script> --><script data-x=">">a\r\nb</script><SCRIPT TYPE="MODULE">moduleCode</SCRIPT><script type="application/ld+json">{}</script><script src="/x.js">external</script><script type="text/javascript">a\nb</script><template><script>templateCode</script></template><script type="importmap">{"imports":{}}</script>`;
  assert.deepEqual(inlineHashes(html), new Set(['a\nb', 'moduleCode', 'templateCode', '{"imports":{}}'].map(hash)));
});

test('全ページ共通のCSPと外部CSSを生成し、再実行でもヘッダーを重複させない', () => {
  const dir = mkdtempSync(join(tmpdir(), 'csp-'));
  try {
    mkdirSync(join(dir, 'nested'));
    writeFileSync(join(dir, '_headers'), "/*\n  Content-Security-Policy: old\n  X-Test: keep\n/nested/*\n  Content-Security-Policy: duplicate\n");
    writeFileSync(join(dir, 'index.html'), '<html><head><style>body{color:red}</style></head><body style="margin:0"><script>one()</script></body></html>');
    writeFileSync(join(dir, 'nested/page.html'), '<script>two()</script><script>one()</script>');
    writeFileSync(join(dir, '404.html'), '<script>missing()</script>');
    const result = buildCsp(dir);
    assert.deepEqual(result.hashes, new Set(['one()', 'two()', 'missing()'].map(hash)));
    const html = readFileSync(join(dir, 'index.html'), 'utf8');
    assert.doesNotMatch(html, /<style| style=/);
    assert.match(html, /rel="stylesheet"/);
    const headers = readFileSync(join(dir, '_headers'), 'utf8');
    assert.equal(headers.match(/Content-Security-Policy:/g).length, 1);
    for (const script of ['one()', 'two()', 'missing()']) assert.ok(headers.includes(hash(script)));
    assert.match(headers, /X-Test: keep/);
    assert.match(headers, /script-src-attr 'none'; style-src 'self'; style-src-attr 'none'/);
    assert.doesNotMatch(headers, /'unsafe-inline'|'unsafe-eval'|nonce-/);
    buildCsp(dir);
    assert.equal(readFileSync(join(dir, '_headers'), 'utf8'), headers);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('CSPの重複・禁止属性・ハッシュ集合の上限超過でビルドを失敗させる', () => {
  for (const html of [
    '<meta http-equiv="Content-Security-Policy" content="default-src *">',
    '<button onclick="run()">go</button>',
    '<script nonce="fixed">run()</script>',
    Array.from({ length: 40 }, (_, i) => `<script>run(${i})</script>`).join(''),
  ]) {
    const dir = mkdtempSync(join(tmpdir(), 'csp-reject-'));
    try {
      writeFileSync(join(dir, '_headers'), '/*\n  X-Test: keep\n');
      writeFileSync(join(dir, 'index.html'), html);
      assert.throws(() => buildCsp(dir), /CSPが重複|禁止属性|2,000/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});
