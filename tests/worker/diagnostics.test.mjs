import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { registerHooks } from 'node:module';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { exceptionDiagnostics } from '../../src/lib/error-diagnostics.ts';

const events = [], completed = [];
let scope, sentryOptions;
const testDocument = new EventTarget();
const sentryMock = {
  init(options) { sentryOptions = options; },
  withScope(run) {
    scope = { contexts: {}, setContext(name, value) { Object.assign(this.contexts, { [name]: value }); }, setTag() {}, setTags() {}, setExtra() {}, setFingerprint(value) { this.fingerprint = value; } };
    run(scope);
  },
  captureException(error) { events.push({ error, contexts: structuredClone(scope.contexts), fingerprint: scope.fingerprint }); },
};
globalThis.diagnosticsTest = { sentry: sentryMock, posthog: { init() {}, capture(name, properties) { completed.push({ name, properties }); } } };
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === '@sentry/browser') return { url: 'data:text/javascript,export const {init,withScope,captureException} = globalThis.diagnosticsTest.sentry', shortCircuit: true };
    if (specifier === 'posthog-js') return { url: 'data:text/javascript,export default globalThis.diagnosticsTest.posthog', shortCircuit: true };
    if (specifier === '@/lib/google-analytics') return { url: 'data:text/javascript,export const initializeGoogleAnalytics = () => {}; export const trackGooglePageView = () => {}', shortCircuit: true };
    if (specifier.startsWith('@/')) return { url: new URL('../../src/' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true };
    if (specifier.endsWith('?worker&url')) return { url: 'data:text/javascript,export default "/_astro/split.worker-test.js"', shortCircuit: true };
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.endsWith('/analytics.ts') || url.includes('/split.worker.ts?test')) {
      // テスト対象として限定したローカルTSソースだけを読む。
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      let source = readFileSync(new URL(url), 'utf8')
        .replaceAll('import.meta.env.PUBLIC_SENTRY_DSN', url.includes('split.worker') ? '""' : '"test-dsn"')
        .replaceAll('import.meta.env.PUBLIC_POSTHOG_KEY', '"test-key"')
        .replaceAll('import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID', '""')
        .replaceAll('__APP_VERSION__', '"test"').replaceAll('__WASM_VERSION__', '"' + 'a'.repeat(64) + '"')
        .replaceAll('__DEPLOY_COMMIT__', '"test"').replaceAll('__DEPLOY_ENVIRONMENT__', '"test"');
      if (url.includes('split.worker')) source = source.replace('\ninitWasm();', '\nexport { fetchAsset, initFailure, firstAssetError };');
      return { source: ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText, format: 'module', shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});
const analytics = await import('../../src/lib/analytics.ts');
const { createEngineClient } = await import('../../src/lib/engine-client.ts');
const { browserDiagnostics, initializeBrowserDiagnostics } = await import('../../src/lib/browser-diagnostics.ts');
after(() => { hooks.deregister(); delete globalThis.diagnosticsTest; });

test('空の例外・取得不能な値でも診断でき、例外文とスタックの上限を守る', () => {
  for (const value of [null, undefined, '', 3, new Proxy({}, { get() { throw new Error('取得不可'); } })]) assert.doesNotThrow(() => exceptionDiagnostics(value, {}));
  const result = exceptionDiagnostics({ message: 'm'.repeat(2000), stack: 's'.repeat(9000), name: 'TypeError' });
  assert.equal(result.message.length, 1000);
  assert.equal(result.stack.length, 8000);
  assert.equal(exceptionDiagnostics(undefined, {}).filename, undefined);
});

test('実際の資材失敗通知から検索・未処理の両Sentry経路へ元例外とURLが届く', async t => {
  const originalFetch = globalThis.fetch, originalWorker = globalThis.Worker;
  const originalWindow = globalThis.window, originalDocument = globalThis.document, originalSelf = globalThis.self, originalPost = globalThis.postMessage;
  const notifications = [];
  globalThis.window = { location: new URL('https://example.test/fare/ticket?route=A-B') };
  globalThis.document = testDocument;
  const originalOnMessage = globalThis.onmessage;
  globalThis.onmessage = null;
  globalThis.self = { location: new URL('https://example.test/_astro/worker.js') };
  globalThis.postMessage = value => notifications.push(structuredClone(value));
  t.after(() => { globalThis.fetch = originalFetch; globalThis.Worker = originalWorker; globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.self = originalSelf; globalThis.postMessage = originalPost; globalThis.onmessage = originalOnMessage; });
  const workerModule = await import('../../src/app/split/split.worker.ts?test');
  globalThis.fetch = async () => { throw new TypeError('Load failed'); };
  let original;
  try { await workerModule.fetchAsset('https://example.test/engine/main.wasm?version=1#asset', 'wasm_fetch'); }
  catch (error) { original = error; }
  const failure = workerModule.initFailure(original, 'wasm_fetch', original.retryCount, 'ticket');
  assert.equal(failure.diagnostics.resources.length, 3);
  assert.equal(failure.diagnostics.resources[2].attempt, 3);
  assert.equal(failure.diagnostics.exception.name, 'TypeError');
  assert.ok(notifications.some(item => item.diagnostics.phases));
  let transport;
  globalThis.Worker = class { constructor() { transport = this; } terminate() {} };
  const client = createEngineClient({ isolated: true });
  const context = { capability: 'ticket', searchId: 'search', startedAt: performance.now(), searchType: 'ticket', search: { searchSurface: 'fare', searchUrl: window.location.href, originStation: 'A', destinationStation: 'B', routeStations: ['A', 'B'] } };
  const pending = client.ensureReady('ticket').catch(error => error);
  transport.onmessage({ data: failure });
  transport.onmessage({ data: failure });
  const error = await pending;
  const before = events.length;
  analytics.captureSearchError(error, context);
  analytics.captureUnhandledError(error, 'calculation_web_worker');
  assert.equal(events.length, before + 2);
  for (const event of events.slice(-2)) {
    assert.equal(event.contexts.engine_diagnostics.resources[0].url, 'https://example.test/engine/main.wasm?version=1#asset');
    assert.equal(event.contexts.engine_diagnostics.exception.message, 'Load failed');
    assert.ok(event.contexts.engine_diagnostics.exception.stack.includes('TypeError'));
    assert.equal(event.contexts.engine_diagnostics.attempts.length, 2);
  }
  assert.deepEqual(events[events.length - 2].fingerprint, ['engine_asset_fetch_failed', 'wasm_fetch', 'ticket', 'none']);
  assert.equal(events[events.length - 1].fingerprint, undefined);
  analytics.captureEngineRecovery({ recovered: true, workerRestartCount: 1 }, context);
  analytics.captureSuccessfulSearch(context, {});
  assert.equal(events.length, before + 2);
  assert.equal(completed[completed.length - 1].properties.worker_restart_count, 1);
  client.terminate();

  // 旧資材の403と新資材へのフォールバックの両方を保持する。
  const oldUrl = 'https://example.test/engine/' + 'a'.repeat(64) + '/main.wasm';
  globalThis.fetch = async url => url === oldUrl ? new Response('', { status: 403 }) : url.endsWith('/deployment.json') ? Response.json({ enginePath: '/engine/' + 'b'.repeat(64) }) : new Response('wasm');
  const fetched = await workerModule.fetchAsset(oldUrl, 'wasm_fetch');
  assert.equal(fetched.retryCount, 1);
  const recovered = workerModule.firstAssetError('ticket');
  assert.ok(recovered.diagnostics.resources.some(resource => resource.fallbackFrom === oldUrl && resource.outcome === 'success'));

  // HTTP 200でも本文の通信が途中で切れた場合は、資材全体を再取得する。
  let bodyCalls = 0;
  const bodyUrl = 'https://example.test/engine/body.wasm';
  globalThis.fetch = async () => {
    bodyCalls++;
    return bodyCalls === 1
      ? new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Load failed')); } }))
      : new Response('complete');
  };
  const bodyFetched = await workerModule.fetchAsset(bodyUrl, 'wasm_fetch');
  assert.equal(bodyFetched.retryCount, 1);
  assert.equal(new TextDecoder().decode(bodyFetched.buffer), 'complete');
  assert.ok(workerModule.firstAssetError('ticket').diagnostics.resources.some(resource => resource.url === bodyUrl && resource.phase === 'wasm_body_read' && resource.outcome === 'failure'));

  // ヘッダーだけ届いて本文が停止しても、8秒後に中断して次の取得へ進む。
  const stalledUrl = 'https://example.test/engine/stalled.bin';
  let stalledCalls = 0;
  let aborted = false;
  globalThis.fetch = async (_url, { signal }) => {
    if (++stalledCalls > 1) return new Response('graph');
    return new Response(new ReadableStream({ start(controller) {
      signal.addEventListener('abort', () => { aborted = true; controller.error(new DOMException('中断', 'AbortError')); }, { once: true });
    } }));
  };
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const stalled = workerModule.fetchAsset(stalledUrl, 'ticket_graph_fetch');
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(8_000);
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(150);
    const fetchedAfterTimeout = await stalled;
    assert.equal(aborted, true);
    assert.equal(fetchedAfterTimeout.retryCount, 1);
    assert.equal(new TextDecoder().decode(fetchedAfterTimeout.buffer), 'graph');
    assert.ok(workerModule.firstAssetError('ticket').diagnostics.resources.some(resource => resource.url === stalledUrl && resource.phase === 'ticket_graph_body_read' && resource.timedOut === true));
  } finally { t.mock.timers.reset(); }

  globalThis.document = testDocument;
  initializeBrowserDiagnostics();
  initializeBrowserDiagnostics();
  for (let id = 1; id <= 2; id++) {
    testDocument.dispatchEvent(Object.assign(new Event('astro:before-preparation'), { from: new URL('https://example.test/a'), to: new URL('https://example.test/b?route=A-B') }));
    assert.equal(browserDiagnostics().navigation.id, id);
  }
  testDocument.dispatchEvent(new Event('astro:after-swap'));
  assert.equal(browserDiagnostics().navigation.completed, false);
  testDocument.dispatchEvent(new Event('astro:page-load'));
  assert.equal(browserDiagnostics().navigation.completed, true);
  const event = { exception: { values: [{ type: 'RangeError', value: 'Maximum call stack size exceeded.' }] } };
  const result = sentryOptions.beforeSend(event);
  assert.equal(result.contexts.browser_diagnostics.webAssemblySupported, true);
  assert.equal(events.length, 2);
});
