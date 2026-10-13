import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { manifestResponse, normalizeLaunch } from '../../src/pwa/manifest.mjs';
import { fetchEngineAsset } from '../../workers/frontend.mjs';

const origin = 'https://kippu-navi.com';
test('manifest preserves calculator conditions without accepting arbitrary URLs or tracking', async () => {
  const launch = '/split/route/pass?route=東京[東海道]熱海&month=3&noSplitStation=品川&noSplitStation=品川&utm_source=x';
  const request = new Request(`${origin}/manifest.webmanifest?${new URLSearchParams({ launch })}`);
  const response = manifestResponse(request);
  const manifest = await response.json();
  const target = new URL(manifest.start_url, origin);
  assert.equal(manifest.id, manifest.start_url);
  assert.equal(target.searchParams.get('route'), '東京[東海道]熱海');
  assert.equal(target.searchParams.get('month'), '3');
  assert.deepEqual(target.searchParams.getAll('noSplitStation'), ['品川']);
  assert.equal(target.searchParams.has('utm_source'), false);
  assert.equal(manifest.display, 'standalone');
  for (const unsafe of ['//evil.test/', '/\\evil.test/', '/api/split-pass', 'https://evil.test/', '/missing', '/%2e%2e/api']) {
    assert.equal(normalizeLaunch(unsafe, origin), '/');
  }
  assert.equal(normalizeLaunch('/guide?from=東京', origin), '/guide');
});
test('exact engine requests never substitute the current deployment', async () => {
  let calls = 0;
  const response = await fetchEngineAsset(new Request(`${origin}/engine/${'a'.repeat(64)}/main.wasm`, { headers: { 'X-Kippu-Exact-Asset': '1' } }), {
    fetch: () => { calls++; return new Response(null, { status: 404 }); },
  });
  assert.equal(response.status, 404);
  assert.equal(calls, 1);
});

const source = readFileSync('src/pwa/service-worker.js', 'utf8');
const sha = body => createHash('sha256').update(body).digest('hex');
function worker({ fail = '', mismatch = '', quota = false, windows = [{ id: 'current' }] } = {}) {
  const events = new Map();
  const stores = new Map([['kippu-pwa-old', new Map()], ['unrelated', new Map()]]);
  const bodies = new Map([['/', 'html-v1'], ['/engine/v1/main.wasm', 'wasm-v1'], ['/_astro/font.woff2', 'font-v1'], ['/deployment.json', '{"enginePath":"/engine/v1"}']]);
  const requests = [];
  const notifications = [];
  let offline = false;
  let applied = 0;
  const caches = {
    keys: async () => [...stores.keys()], delete: async key => stores.delete(key),
    open: async key => {
      if (!stores.has(key)) stores.set(key, new Map());
      const store = stores.get(key);
      return { match: async url => store.get(url)?.clone(), put: async (url, response) => {
        if (quota) throw new Error('QuotaExceededError');
        store.set(url, response.clone());
      } };
    },
  };
  const context = vm.createContext({
    RELEASE: { version: 'v1', assets: [...bodies].map(([url, body]) => ({ url, sha256: sha(body), size: body.length })) },
    self: { location: { origin }, registration: { waiting: { state: 'installed' } }, clients: { matchAll: async () => windows.map(client => ({ ...client, postMessage: message => notifications.push(message) })) }, skipWaiting: async () => { applied++; }, addEventListener: (name, handler) => { events.set(name, handler); } },
    crypto: webcrypto, caches, Response, URL, console: { debug() {} },
    fetch: async url => {
      requests.push(url);
      if (offline || url === fail) throw new Error('Network failure');
      return new Response(url === mismatch ? 'v2' : bodies.get(url));
    },
  });
  vm.runInContext(source, context);
  const run = async name => { let promise; events.get(name)({ waitUntil(p) { promise = p; } }); await promise; };
  return { stores, requests, notifications, run, get applied() { return applied; }, async message(type, path = '/changelog', messageOrigin = origin, sourceOrigin = origin) {
    let promise;
    let reply;
    events.get('message')({ origin: messageOrigin, data: { type }, source: { id: 'current', url: sourceOrigin + path }, ports: [{ postMessage(value) { reply = value; } }], waitUntil(value) { promise = value; } });
    await promise;
    return reply;
  }, setOffline() { offline = true; }, fetch(path, method = 'GET') {
    let response;
    events.get("fetch")({ request: new Request(new URL(path, origin), { method }), respondWith(p) { response = Promise.resolve(p); } });
    return response;
  } };
}
test('complete release caches fonts and query-independent pages, leaves APIs alone', async () => {
  const sw = worker(); await sw.run('install');
  assert.ok(sw.stores.has('kippu-pwa-old')); // waiting worker must retain the active release
  await sw.run('activate');
  assert.ok(!sw.stores.has('kippu-pwa-old'));
  assert.ok(sw.stores.has('unrelated'));
  sw.setOffline();
  assert.equal(await (await sw.fetch('/?from=東京')).text(), 'html-v1');
  assert.equal(await (await sw.fetch('/_astro/font.woff2')).text(), 'font-v1');
  for (const path of ['/api/split-ticket', '/ingest/a', '/monitoring', '/manifest.webmanifest', '/sw.js', 'https://external.test/font']) assert.equal(sw.fetch(path), undefined);
  assert.equal((await sw.fetch('/engine/v2/main.wasm')).status, 404);
  sw.stores.get('kippu-pwa-v1').delete('/_astro/font.woff2');
  assert.equal((await sw.fetch('/_astro/font.woff2')).status, 503);
});
for (const failure of [{ fail: '/_astro/font.woff2' }, { mismatch: '/' }, { quota: true }]) {
  test(`incomplete release never replaces old cache: ${JSON.stringify(failure)}`, async () => {
    const sw = worker(failure);
    await assert.rejects(sw.run('install'));
    assert.ok(sw.stores.has('kippu-pwa-old'));
    assert.ok(!sw.stores.has('kippu-pwa-v1'));
  });
}

test('development and preview middleware return a manifest before static HTML handling', async () => {
  const { pwaManifestPlugin } = await import('../../scripts/pwa-vite-plugin.mjs');
  for (const configure of [pwaManifestPlugin().configureServer, pwaManifestPlugin().configurePreviewServer]) {
    let middleware;
    assert.equal(configure({ middlewares: { use(handler) { middleware = handler; return this; } } }), undefined);
    let body;
    const headers = new Map();
    const response = { statusCode: 0, setHeader(name, value) { headers.set(name, value); }, end(value) { body = value; } };
    await middleware({ url: '/manifest.webmanifest?launch=%2Fsplit%2Fauto%2Fpass%3Fmonth%3D3', method: 'GET' }, response, () => assert.fail('must not reach static HTML'));
    assert.equal(response.statusCode, 200);
    assert.equal(JSON.parse(body).start_url, '/split/auto/pass?month=3');
    assert.match(headers.get('content-type'), /manifest/);
  }
});

test('manual update requires a complete release, changelog source, and no other windows', async () => {
  const sw = worker();
  assert.equal((await sw.message('PWA_APPLY_UPDATE')).ok, false);
  await sw.run('install');
  assert.equal((await sw.message('PWA_STATUS')).complete, true);
  assert.equal(sw.applied, 0);
  assert.equal((await sw.message('PWA_APPLY_UPDATE', '/split/auto/ticket')).ok, false);
  assert.equal(sw.applied, 0);
  assert.equal((await sw.message('PWA_APPLY_UPDATE')).ok, true);
  assert.equal(sw.applied, 1);
  const multi = worker({ windows: [{ id: 'current' }, { id: 'editing' }] });
  await multi.run('install');
  assert.equal((await multi.message('PWA_APPLY_UPDATE')).reason, 'other-windows');
  assert.equal(multi.applied, 0);
  assert.ok(multi.stores.has('kippu-pwa-old'));
  multi.stores.get('kippu-pwa-v1').delete('/_astro/font.woff2');
  assert.equal((await multi.message('PWA_STATUS')).complete, false);
});

test('messages require both event origin and source URL to match the service worker origin', async () => {
  const sw = worker();
  await sw.run('install');
  for (const type of ['PWA_STATUS', 'PWA_APPLY_UPDATE']) {
    for (const untrusted of ['https://evil.example', '', 'null']) {
      assert.equal(await sw.message(type, '/changelog', untrusted), undefined);
    }
    assert.equal(await sw.message(type, '/changelog', origin, 'https://evil.example'), undefined);
  }
  assert.equal(sw.applied, 0);
  assert.equal((await sw.message('PWA_STATUS')).complete, true);
  assert.equal((await sw.message('PWA_APPLY_UPDATE')).ok, true);
  assert.equal(sw.applied, 1);
});

for (const [failure, stage, asset] of [
  [{ fail: '/_astro/font.woff2' }, '資材取得', '/_astro/font.woff2'],
  [{ mismatch: '/' }, '整合性検証', '/'],
  [{ quota: true }, '端末への保存', '/'],
]) {
  test(`failed installation reports transient details before discarding its cache: ${stage}`, async () => {
    const sw = worker(failure);
    await assert.rejects(sw.run('install'));
    assert.equal(sw.notifications[0].type, 'PWA_FAILURE');
    assert.equal(sw.notifications[0].detail.stage, stage);
    assert.equal(sw.notifications[0].detail.asset, asset);
    assert.ok(sw.notifications[0].detail.message);
    assert.ok(!sw.stores.has('kippu-pwa-v1'));
    assert.ok(sw.stores.has('kippu-pwa-old'));
  });
}
