/* global RELEASE */
// RELEASEはビルド後に埋め込む。同一版のすべての資材が揃うまでactivateしない。
const PREFIX = 'kippu-pwa-';
const CACHE = PREFIX + RELEASE.version;
const assets = new Map(RELEASE.assets.map(asset => [asset.url, asset]));
const digest = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
function errorDetail(error, stage, asset) {
  return error?.pwaDetail || { stage, asset, name: error?.name || 'Error', message: error?.message || String(error) };
}
async function operation(stage, asset, run) {
  try { return await run(); } catch (error) {
    const failure = new Error(error?.message || String(error));
    failure.pwaDetail = errorDetail(error, stage, asset);
    throw failure;
  }
}
async function notifyFailure(error) {
  try {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: 'PWA_FAILURE', detail: errorDetail(error, '保存') });
  } catch { /* 通知先がない場合も失敗したインストールは終了させる。 */ }
}
async function checkedFetch(asset) {
  const response = await operation('資材取得', asset.url, async () => {
    const response = await fetch(asset.url, { cache: 'no-store', redirect: 'error', headers: { 'X-Kippu-Exact-Asset': '1' } });
    if (!response.ok) throw new Error(`HTTP ${response.status} ${response.statusText}`);
    return response;
  });
  await operation('整合性検証', asset.url, async () => {
    if (await digest(await response.clone().arrayBuffer()) !== asset.sha256) throw new Error('SHA-256が一致しません');
  });
  return response;
}
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    try {
      const candidates = (await caches.keys()).filter(key => key.startsWith(PREFIX) && key !== CACHE);
      const cache = await operation('保存領域の準備', undefined, () => caches.open(CACHE));
      // 全Promiseを待ってから失敗キャッシュを削除し、遅い書き込みによる復活を防ぐ。
      let next = 0;
      const results = await Promise.allSettled(Array.from({ length: 4 }, async () => {
        while (next < RELEASE.assets.length) {
          const asset = RELEASE.assets[next++];
          const prior = await operation('保存済み資材の確認', asset.url, () => cache.match(asset.url));
          if (prior && await digest(await prior.clone().arrayBuffer()) === asset.sha256) continue;
          let response;
          for (const key of candidates) {
            try {
              const old = await caches.open(key);
              const cached = await old.match(asset.url);
              if (cached && await digest(await cached.clone().arrayBuffer()) === asset.sha256) {
                response = cached;
                break;
              }
            } catch { /* 読み出せない旧版は見送り、次の候補かネットワークを使う。 */ }
          }
          response ??= await checkedFetch(asset);
          // 保存失敗は旧版の読み出し失敗と分離し、インストールを失敗させる。
          await operation('端末への保存', asset.url, () => cache.put(asset.url, response));
        }
      }));
      const failure = results.find(result => result.status === 'rejected');
      if (failure) throw failure.reason;
    } catch (error) {
      await notifyFailure(error);
      try { await caches.delete(CACHE); } catch { /* 元の失敗理由を保持する。 */ }
      throw error;
    }
    // skipWaitingは使わず、旧版を使用する画面がすべて閉じるまで待つ。
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith(PREFIX) && key !== CACHE) await caches.delete(key);
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

// 更新履歴に表示する保存状態を返す。
async function releaseStatus() {
  const cache = await caches.open(CACHE);
  const present = await Promise.all(RELEASE.assets.map(asset => cache.match(asset.url)));
  return { version: RELEASE.version, appVersion: RELEASE.appVersion, complete: present.every(Boolean) };
}
self.addEventListener('message', event => {
  if (event.origin !== self.location.origin) return;
  const port = event.ports?.[0];
  const source = event.source;
  if (!port || !source?.url || new URL(source.url).origin !== self.location.origin) return;
  event.waitUntil((async () => {
    try {
      if (event.data?.type === 'PWA_STATUS') {
        port.postMessage(await releaseStatus());
      }
    } catch (error) {
      port.postMessage({ ok: false, reason: 'failed', detail: errorDetail(error, '状態取得') });
    }
  })());
});
