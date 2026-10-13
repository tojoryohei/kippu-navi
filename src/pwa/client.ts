import { standalone, workerRequest, describeError, type ErrorDetail, type ReleaseStatus } from "./status";
// 状態表示と手動更新は更新履歴ページに限定する。
function updateManifest() {
  const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (link) link.href = `/manifest.webmanifest?${new URLSearchParams({ launch: location.pathname + location.search })}`;
}
let updating = false;
let registration: ServiceWorkerRegistration | undefined;
let checkState: 'idle' | 'checking' | 'checked' | 'failed' = 'idle';
let installFailed = false;
let applying = false;
let actionError = '';
let preparationError = '';
let attemptWorker: ServiceWorker | null = null;
function failureText(error: unknown, stage: string) {
  return describeError({ stage, name: error instanceof Error ? error.name : 'Error', message: error instanceof Error ? error.message : String(error) });
}
const watched = new WeakSet<ServiceWorker>();
function watch(worker: ServiceWorker | null) {
  if (!worker || watched.has(worker)) return;
  watched.add(worker);
  attemptWorker = worker;
  let installed = worker.state === 'installed' || worker.state === 'activating' || worker.state === 'activated';
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') installed = true;
    if (worker.state === 'redundant' && !installed && worker === attemptWorker) {
      installFailed = true;
      preparationError ||= '更新に失敗しました。詳細は取得できませんでした。';
    }
    if (worker.state === 'installed' && worker === attemptWorker) { installFailed = false; preparationError = ''; }
    void renderStatus();
  });
}
function observe(value: ServiceWorkerRegistration) {
  if (registration === value) return;
  registration = value;
  value.addEventListener('updatefound', () => {
    installFailed = false;
    preparationError = '';
    watch(value.installing);
    void renderStatus();
  });
  watch(value.installing);
}
let renderSequence = 0;
async function renderStatus() {
  const panel = document.querySelector<HTMLElement>('[data-pwa-status]');
  if (!panel) return;
  const sequence = ++renderSequence;
  const set = (key: string, text: string) => {
    const element = panel.querySelector(`[data-pwa-${key}]`);
    if (element) element.textContent = text;
  };
  set('mode', standalone() ? 'PWA' : '通常ブラウザ');
  set('version', `${__APP_VERSION__} (${__DEPLOY_COMMIT__.slice(0, 7)})`);
  const button = panel.querySelector<HTMLButtonElement>('[data-pwa-update]')!;
  button.hidden = true;
  button.disabled = applying;
  set('error', actionError || preparationError);
  if (!('serviceWorker' in navigator)) {
    set('next', '確認できません');
    set('storage', 'この環境では利用できません');
    set('state', '更新確認は利用できません');
    return;
  }
  let current = registration;
  try { current ||= await navigator.serviceWorker.getRegistration('/'); } catch (error) {
    set('error', failureText(error, '登録状態の確認'));
    set('storage', '保存状態を確認できません');
    set('state', '更新確認に失敗しました');
    return;
  }
  if (sequence !== renderSequence) return;
  if (current) observe(current);
  const waiting = current?.waiting;
  const installing = current?.installing;
  const active = navigator.serviceWorker.controller || current?.active;
  let saved: ReleaseStatus | undefined;
  let next: ReleaseStatus | undefined;
  let statusError = '';
  await Promise.all([
    installing ? workerRequest<ReleaseStatus>(installing, 'PWA_STATUS').catch(error => { statusError = failureText(error, '保存処理の状態取得'); }) : undefined,
    active ? workerRequest<ReleaseStatus>(active, 'PWA_STATUS').then(value => { saved = value; }).catch(error => { statusError = failureText(error, '状態取得'); }) : undefined,
    waiting ? workerRequest<ReleaseStatus>(waiting, 'PWA_STATUS').then(value => { next = value; }).catch(error => { statusError = failureText(error, '状態取得'); }) : undefined,
  ]);
  if (sequence !== renderSequence || !panel.isConnected) return;
  set('error', actionError || preparationError || statusError);
  set('storage', current?.installing ? '保存中' : installFailed ? '保存失敗（次回オンライン時に再試行）' : saved?.complete || next?.complete ? '保存済み' : saved?.complete === false ? '保存データが不足しています' : active ? '保存状態を確認できません' : '未準備');
  set('next', next ? `${next.appVersion || '版不明'} (${next.version.slice(0, 8)})` : waiting ? '確認できません' : 'なし');
  const ready = !!waiting && next?.complete === true;
  set('state', applying ? '更新を適用中' : ready ? '次回起動で反映予定' : waiting ? '新版の保存状態を確認できません' : current?.installing ? statusError ? '更新処理の状態を確認できませんでした' : '新版を保存中' : installFailed ? '新版の保存に失敗しました' : statusError ? '更新処理の状態を確認できませんでした' : checkState === 'checking' ? '確認中' : checkState === 'failed' ? '更新確認に失敗しました' : !navigator.onLine ? 'オフラインのため確認できません' : checkState === 'checked' ? '更新なし' : standalone() ? '未確認' : 'PWAから開くと更新を確認できます');
  button.hidden = !ready || !standalone();
  button.onclick = () => { void applyUpdate(); };
}
async function applyUpdate() {
  const waiting = registration?.waiting;
  if (!waiting || applying || location.pathname !== '/changelog') return;
  applying = true;
  actionError = '';
  void renderStatus();
  try {
    const result = await workerRequest<{ ok: boolean; reason?: string }>(waiting, 'PWA_APPLY_UPDATE');
    if (!result.ok) throw new Error(result.reason === 'other-windows'
      ? 'ほかのきっぷナビの画面を閉じてから、もう一度押してください。'
      : '更新を適用できませんでした。ページを開き直して再試行してください。');
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { waiting.removeEventListener('statechange', changed); reject(new Error('更新の有効化を確認できませんでした。ページを開き直してください。')); }, 15000);
      const changed = () => {
        if (waiting.state === 'activated') { clearTimeout(timer); waiting.removeEventListener('statechange', changed); resolve(); }
        else if (waiting.state === 'redundant') { clearTimeout(timer); waiting.removeEventListener('statechange', changed); reject(new Error('更新に失敗しました。')); }
      };
      waiting.addEventListener('statechange', changed);
      changed();
    });
    if (location.pathname === '/changelog') location.reload();
  } catch (error) {
    actionError = error instanceof Error ? error.message : '更新に失敗しました。';
  } finally {
    applying = false;
    void renderStatus();
  }
}
async function updateOfflineAssets() {
  if (!standalone() || !navigator.onLine || !('serviceWorker' in navigator) || updating) return;
  updating = true;
  checkState = 'checking';
  actionError = '';
  if (!registration?.installing) { installFailed = false; preparationError = ''; }
  void renderStatus();
  try {
    const current = await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    observe(current);
    await current.update();
    checkState = 'checked';
  } catch (error) {
    checkState = 'failed';
    preparationError ||= failureText(error, '更新確認');
    // 通信・容量制限で準備できない場合は、次のオンライン起動で再試行する。
  } finally { updating = false; void renderStatus(); }
}
document.addEventListener('astro:page-load', () => { updateManifest(); void renderStatus(); void updateOfflineAssets(); });
window.addEventListener('calculator:url-change', updateManifest);
window.addEventListener('popstate', updateManifest);
window.addEventListener('online', () => { void updateOfflineAssets(); });
// ClientRouterによらない初回アクセスにも対応。
updateManifest();
void updateOfflineAssets();

window.addEventListener('offline', () => { void renderStatus(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && location.pathname === '/changelog') { void renderStatus(); void updateOfflineAssets(); }
});
void renderStatus();

if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== attemptWorker || event.data?.type !== 'PWA_FAILURE') return;
  const detail = event.data.detail as ErrorDetail | undefined;
  if (!detail || typeof detail.stage !== 'string' || typeof detail.name !== 'string' || typeof detail.message !== 'string') return;
  preparationError = describeError(detail);
  installFailed = true;
  void renderStatus();
});

// 状態取得だけを再試行する。インストールや経路計算に制限時間は設けない。
setInterval(() => {
  if (location.pathname === '/changelog' && document.visibilityState === 'visible' && registration?.installing) void renderStatus();
}, 15000);
