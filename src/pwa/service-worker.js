/* global RELEASE */
// RELEASEはビルド後に埋め込む。同一版のすべての資材が揃うまでactivateしない。
const PREFIX = 'kippu-pwa-';
const CACHE = PREFIX + RELEASE.version;
const assets = new Map(RELEASE.assets.map(asset => [asset.url, asset]));
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
async function checkedFetch(asset) {
  const response = await fetch(asset.url, { cache: 'no-store', redirect: 'error', headers: { 'X-Kippu-Exact-Asset': '1' } });
  if (!response.ok) throw new Error(`Asset unavailable: ${asset.url}`);
  if (await digest(await response.clone().arrayBuffer()) !== asset.sha256) throw new Error(`Asset version mismatch: ${asset.url}`);
  return response;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    try {
      // 全Promiseを待ってから失敗キャッシュを削除し、遅い書き込みによる復活を防ぐ。
      let next = 0;
      const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
        while (next < RELEASE.assets.length) {
          const asset = RELEASE.assets[next++];
          const prior = await cache.match(asset.url);
          if (prior && await digest(await prior.clone().arrayBuffer()) === asset.sha256) continue;
          await cache.put(asset.url, await checkedFetch(asset));
        }
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
      console.debug('[PWA] Prepared', RELEASE.version, RELEASE.bytes);
    } catch (error) { await caches.delete(CACHE); throw error; }
    // skipWaitingしない。入力・計算中のページには旧Workerを使わせる。
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
    console.debug('[PWA] Active', RELEASE.version);
    // 初回もclaimしない。保存した版と異なる、開いたままのページを取り込まない。
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // API、監視、広告、manifest、更新確認は横取りしない。
  const key = url.pathname === '/index.html' ? '/' : url.pathname.replace(/\.html$/, '');
  const asset = assets.get(key);
  if (!asset) {
    // ハッシュの違うエンジンをサーバーの最新版フォールバックで混在させない。
    if (url.pathname.startsWith('/engine/')) event.respondWith(new Response(null, { status: 404 }));
    return;
  }
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(asset.url);
    if (cached) return cached;
    try {
      const response = await checkedFetch(asset);
      await cache.put(asset.url, response.clone());
      return response;
    } catch {
      // 取得できない旧版を別の版で補わない。次のオンライン起動で再準備する。
      return new Response(null, { status: 503, statusText: 'Offline asset unavailable' });
    }
  })());
});
