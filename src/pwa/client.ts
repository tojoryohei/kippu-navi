// 製品画面には保存・更新の状態を出さない。
function updateManifest() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) link.href = `/manifest.webmanifest?${new URLSearchParams({ launch: location.pathname + location.search })}`;
}
function standalone() {
  return matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
let updating = false;
async function updateOfflineAssets() {
  if (!standalone() || !navigator.onLine || !('serviceWorker' in navigator) || updating) return;
  updating = true;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    await registration.update();
  } catch (error) {
    console.debug('[PWA] Preparation deferred', error);
  } finally { updating = false; }
}
document.addEventListener('astro:page-load', () => { updateManifest(); void updateOfflineAssets(); });
window.addEventListener('calculator:url-change', updateManifest);
window.addEventListener('popstate', updateManifest);
window.addEventListener('online', () => { void updateOfflineAssets(); });
// ClientRouterによらない初回アクセスにも対応。
updateManifest();
void updateOfflineAssets();
