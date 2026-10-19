import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const dist = new URL('../dist/', import.meta.url);
const root = dist.pathname;
const workerRoutes = JSON.parse(readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8')
  .match(/"run_worker_first":\s*(\[[^\]]*\])/)?.[1] || '[]');
let pageUrl = 'https://kippu-navi.com';
const converter = new TurndownService({ headingStyle: 'atx', codeBlockStyle: 'fenced', bulletListMarker: '-' });
converter.use(gfm);
converter.remove(['head', 'title', 'meta', 'link', 'footer', 'nav', 'script', 'style', 'svg', 'form', 'noscript']);
converter.remove(node => node.nodeName === 'HEADER' && node.parentNode?.nodeName !== 'ARTICLE');
converter.addRule('absoluteLinks', {
  filter: node => node.nodeName === 'A' && node.hasAttribute('href'),
  replacement: (content, node) => {
    const href = new URL(node.getAttribute('href'), pageUrl);
    return content.includes('\n')
      ? `\n\n${content.trim()}\n\n[詳細](${href.href})\n\n`
      : `[${content}](${href.href})`;
  },
});

function convert(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { convert(path); continue; }
    if (!entry.name.endsWith('.html') || entry.name === '404.html') continue;
    const name = relative(root, path).replace(/\.html$/, '');
    pageUrl = `https://kippu-navi.com${name === 'index' ? '/' : `/${name}`}`;
    const pathname = new URL(pageUrl).pathname;
    if (!workerRoutes.some(route => route.endsWith('*') ? pathname.startsWith(route.slice(0, -1)) : pathname === route)) {
      throw new Error(`Markdown配信用のWorkerルートがありません: ${pathname}`);
    }
    const destination = join(root, 'agent-markdown', `${name}.txt`);
    mkdirSync(join(destination, '..'), { recursive: true });
    // APIの説明はHTMLからの再変換を避け、公開済みMarkdownをそのまま使う。
    const markdown = name === 'developers/api'
      ? readFileSync(join(root, 'developers/api.md'), 'utf8')
      : converter.turndown(readFileSync(path, 'utf8'));
    writeFileSync(destination, `${markdown.trim()}\n`);
  }
}
convert(root);
