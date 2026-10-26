import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, serialize } from 'parse5';

const digest = text => createHash('sha256').update(text, 'utf8').digest('base64');
const jsTypes = new Set(['module', 'importmap', 'speculationrules', 'application/ecmascript', 'application/javascript', 'application/x-ecmascript', 'application/x-javascript', 'text/ecmascript', 'text/javascript', 'text/javascript1.0', 'text/javascript1.1', 'text/javascript1.2', 'text/javascript1.3', 'text/javascript1.4', 'text/javascript1.5', 'text/jscript', 'text/livescript', 'text/x-ecmascript', 'text/x-javascript']);
const attr = (node, name) => node.attrs?.find(item => item.name === name)?.value;
function walk(node, visit) {
  visit(node);
  for (const child of node.childNodes || []) walk(child, visit);
  // template内のスクリプトも画面遷移で挿入される可能性がある。
  if (node.content) walk(node.content, visit);
}
const textContent = node => (node.childNodes || []).map(child => child.value || '').join('');
export function inlineHashes(html) {
  const hashes = new Set();
  walk(parse(html), node => {
    if (node.tagName !== 'script' || attr(node, 'src') !== undefined) return;
    const type = (attr(node, 'type') ?? (attr(node, 'language') ? `text/${attr(node, 'language')}` : '')).trim().toLowerCase();
    if (!type || jsTypes.has(type)) hashes.add(`'sha256-${digest(textContent(node))}'`);
  });
  return hashes;
}
export function validateHeaders(headers) {
  for (const line of headers.split(/\r?\n/)) {
    if (Buffer.byteLength(line, 'utf8') > 2000) throw new Error(`Cloudflare _headersの行が2,000バイトを超えています (${Buffer.byteLength(line)}): ${line.slice(0, 65)}`);
  }
}
function writeCss(dist, css) {
  const name = `csp-${createHash('sha256').update(css).digest('hex')}.css`;
  mkdirSync(join(dist, '_astro'), { recursive: true });
  writeFileSync(join(dist, '_astro', name), css);
  return `/_astro/${name}`;
}
export function buildCsp(dist) {
  const files = [];
  const scan = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) scan(path);
      else if (entry.name.endsWith('.html')) files.push(path);
    }
  };
  scan(dist);
  if (!files.length) throw new Error('CSP生成にはビルド済みHTMLが必要です。');
  const hashes = new Set();
  for (const file of files) {
    const document = parse(readFileSync(file, 'utf8'));
    const styles = [];
    walk(document, node => {
      if (node.tagName === 'meta' && attr(node, 'http-equiv')?.toLowerCase() === 'content-security-policy') throw new Error(`${file}でmeta要素のCSPが重複しています`);
      for (const item of node.attrs || []) {
        if (/^on/i.test(item.name) || item.name === 'nonce') throw new Error(`${file}に禁止属性${item.name}があります`);
      }
      if (node.tagName === 'style') {
        // media条件を保持し、元の位置でスタイルの適用順序を維持する。
        const href = writeCss(dist, textContent(node));
        node.tagName = node.nodeName = 'link';
        node.attrs = node.attrs.filter(item => item.name !== 'type');
        node.attrs.push({ name: 'rel', value: 'stylesheet' }, { name: 'href', value: href });
        node.childNodes = [];
      }
      const inlineStyle = attr(node, 'style');
      if (inlineStyle !== undefined) {
        const name = `csp-${createHash('sha256').update(inlineStyle).digest('hex').slice(0, 16)}`;
        styles.push(`.${name}{${inlineStyle}}`);
        node.attrs = node.attrs.filter(item => item.name !== 'style');
        const classAttr = node.attrs.find(item => item.name === 'class');
        if (classAttr) classAttr.value += ` ${name}`;
        else node.attrs.push({ name: 'class', value: name });
      }
    });
    if (styles.length) {
      const href = writeCss(dist, [...new Set(styles)].join('\n'));
      const head = document.childNodes.find(node => node.tagName === 'html').childNodes.find(node => node.tagName === 'head');
      const link = parse(`<link rel="stylesheet" href="${href}">`).childNodes.find(node => node.tagName === 'html').childNodes.find(node => node.tagName === 'head').childNodes[0];
      link.parentNode = head;
      head.childNodes.push(link);
    }

    const html = serialize(document);
    writeFileSync(file, html);
    for (const hash of inlineHashes(html)) hashes.add(hash);
  }
  const policy = [
    "default-src 'self'",
    `script-src 'self' 'wasm-unsafe-eval' https://www.google-analytics.com https://www.googletagmanager.com https://static.cloudflareinsights.com https://us-assets.i.posthog.com ${[...hashes].sort().join(' ')}`,
    "script-src-attr 'none'", "style-src 'self'", "style-src-attr 'none'",
    "img-src 'self' data: blob: https:", "font-src 'self'",
    "connect-src 'self' https://*.posthog.com https://*.googleapis.com https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com",
    "frame-src 'self' https://docs.google.com https://www.google.com", "worker-src 'self' blob:", "child-src 'self' blob:",
    "frame-ancestors 'self'", "object-src 'none'", "base-uri 'none'", "form-action 'self'",
  ].join('; ') + ';';
  const path = join(dist, '_headers');
  let headers = readFileSync(path, 'utf8').replace(/^\s*Content-Security-Policy\s*:.*(?:\r?\n|$)/gmi, '');
  const line = `  Content-Security-Policy: ${policy}`;
  if (!/^\/\*\r?$/m.test(headers)) throw new Error('全ページ共通の/*ヘッダールールがありません');
  headers = headers.replace(/^\/\*\r?$/m, `/*\n${line}`);
  validateHeaders(headers);
  writeFileSync(path, headers);
  console.log(`CSP: HTML ${files.length}ページ、スクリプトハッシュ${hashes.size}種類、ヘッダー${Buffer.byteLength(line)}/2000バイト`);
  return { policy, hashes, files };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) buildCsp(resolve('dist'));
