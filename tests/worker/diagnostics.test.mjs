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
    scope = { contexts: {}, tags: {}, setContext(name, value) { Object.assign(this.contexts, { [name]: value }); }, setTag(name, value) { Object.assign(this.tags, { [name]: value }); }, setTags(tags) { Object.assign(this.tags, tags); }, setExtra() {}, setFingerprint(value) { this.fingerprint = value; } };
    run(scope);
  },
  captureException(error) { events.push({ error, contexts: structuredClone(scope.contexts), tags: scope.tags, fingerprint: scope.fingerprint }); },
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
    if (url.endsWith('/analytics.ts') || url.includes('/split-engine.ts?test')) {
      // テスト対象として限定したローカルTSソースだけを読む。
      // eslint-disable-next-line security/detect-non-literal-fs-filename
      let source = readFileSync(new URL(url), 'utf8')
        .replaceAll('import.meta.env.PUBLIC_SENTRY_DSN', url.includes('split-engine') ? '""' : '"test-dsn"')
        .replaceAll('import.meta.env.PUBLIC_POSTHOG_KEY', '"test-key"')
        .replaceAll('import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID', '""')
        .replaceAll('__APP_VERSION__', '"test"').replaceAll('__WASM_VERSION__', '"' + 'a'.repeat(64) + '"')
        .replaceAll('__DEPLOY_COMMIT__', '"test"').replaceAll('__DEPLOY_ENVIRONMENT__', '"test"');
      if (url.includes('split-engine')) source = source.replace('\ninitWasm();', '\nexport { fetchAsset, initFailure, firstAssetError };');
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

test('元例外を保持して同一障害のSentry送信をまとめ、検索結果の記録は維持する', async t => {
  const originalFetch = globalThis.fetch, originalWorker = globalThis.Worker;
  const originalWindow = globalThis.window, originalDocument = globalThis.document, originalSelf = globalThis.self, originalPost = globalThis.postMessage;
  const originalServiceWorker = Object.getOwnPropertyDescriptor(navigator, 'serviceWorker');
  const notifications = [];
  globalThis.window = { location: new URL('https://example.test/fare/ticket?route=A-B') };
  globalThis.document = testDocument;
  const originalOnMessage = globalThis.onmessage;
  globalThis.onmessage = null;
  globalThis.self = { location: new URL('https://example.test/_astro/worker.js') };
  globalThis.postMessage = value => notifications.push(structuredClone(value));
  t.after(() => {
    globalThis.fetch = originalFetch; globalThis.Worker = originalWorker; globalThis.window = originalWindow; globalThis.document = originalDocument; globalThis.self = originalSelf; globalThis.postMessage = originalPost; globalThis.onmessage = originalOnMessage;
    if (originalServiceWorker) Object.defineProperty(navigator, 'serviceWorker', originalServiceWorker);
    else delete navigator.serviceWorker;
  });
  const workerModule = await import('../../src/app/split/split-engine.ts?test');
  globalThis.fetch = async () => { throw new TypeError('Load failed'); };
  let original;
  try { await workerModule.fetchAsset('https://example.test/engine/main.wasm?version=1#asset', 'wasm_fetch'); }
  catch (error) { original = error; }
  const failure = workerModule.initFailure(original, 'wasm_fetch', original.retryCount, 'ticket');
  assert.equal(failure.diagnostics.resources.length, 1);
  assert.equal(failure.diagnostics.resources[0].attempt, 1);
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
  const recordedSearches = completed.length;
  analytics.captureSearchError(error, context);
  assert.equal(completed.length, recordedSearches + 1);
  assert.equal(completed.at(-1).properties.failure_id, error.details.failureId);
  assert.equal(events.length, before + 1);
  for (const event of events.slice(-1)) {
    assert.equal(event.contexts.engine_diagnostics.resources[0].url, 'https://example.test/engine/main.wasm?version=1#asset');
    assert.equal(event.contexts.engine_diagnostics.exception.message, 'Load failed');
    assert.ok(event.contexts.engine_diagnostics.exception.stack.includes('TypeError'));
    assert.equal(event.contexts.engine_diagnostics.attempts, undefined);
  }
  assert.deepEqual(events.at(-1).fingerprint, ['engine_asset_fetch_failed', 'wasm_fetch', 'ticket', 'none']);
  assert.equal(events.at(-1).tags.failure_id, error.details.failureId);
  analytics.captureEngineRecovery({ recovered: true, workerRestartCount: 1 }, context);
  analytics.captureSuccessfulSearch(context, {});
  assert.equal(events.length, before + 1);
  assert.equal(completed[completed.length - 1].properties.worker_restart_count, 1);
  client.terminate();

  const bootstrapClient = createEngineClient({ isolated: true });
  const bootstrapPending = bootstrapClient.ensureReady('ticket').catch(error => error);
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { controller: {
    scriptURL: 'https://example.test/sw.js',
    postMessage(message, [port]) {
      assert.equal(message.type, 'PWA_STATUS');
      port.postMessage({ version: 'cached-version', appVersion: 'old-release', complete: true });
      port.close();
    },
  } } });
  await transport.onerror({});
  analytics.captureSearchError(await bootstrapPending, context);
  for (const event of events.slice(-1)) {
    assert.equal(event.tags.worker_phase, 'before_start');
    assert.equal(event.contexts.engine_diagnostics.workerPhase, 'before_start');
    assert.equal(event.contexts.engine_diagnostics.workerUrl, '/_astro/split.worker-test.js');
    assert.ok(event.contexts.engine_diagnostics.workerElapsedMs >= 0);
  }
  assert.equal(events.at(-1).fingerprint, undefined);
  assert.equal(events.at(-1).tags.component, 'calculation_web_worker');
  assert.ok(events.at(-1).contexts.engine_diagnostics.workerScriptProbe.exception);
  assert.equal(events.at(-1).contexts.engine_diagnostics.serviceWorker.version, 'cached-version');
  bootstrapClient.terminate();

  analytics.captureSearchError(new Error('通信環境を確認して、もう一度計算してください。'), context);
  assert.equal(events.length, before + 2);
  assert.equal(completed.at(-1).properties.outcome, 'business_error');
  assert.equal(completed.at(-1).properties.error_code, 'communication_retry_required');
  assert.equal(completed.at(-1).properties.worker_restart_count, 1);

  // 配信版の解決はCloudflareに任せ、ブラウザでは別URLを取得しない。
  const oldUrl = 'https://example.test/engine/' + 'a'.repeat(64) + '/main.wasm';
  for (const status of [403, 404]) {
    const requests = [];
    globalThis.fetch = async url => {
      requests.push(url);
      return url === oldUrl ? new Response('', { status }) : Response.json({ enginePath: '/engine/' + 'b'.repeat(64) });
    };
    await assert.rejects(workerModule.fetchAsset(oldUrl, 'wasm_fetch'), error => error.httpStatus === status);
    assert.deepEqual(requests, [oldUrl]);
  }

  // HTTP 200でも本文の通信が途中で切れた場合は、自動再取得しない。
  let bodyCalls = 0;
  const bodyUrl = 'https://example.test/engine/body.wasm';
  globalThis.fetch = async () => {
    bodyCalls++;
    return bodyCalls === 1
      ? new Response(new ReadableStream({ start(controller) { controller.error(new TypeError('Load failed')); } }))
      : new Response('complete');
  };
  await assert.rejects(workerModule.fetchAsset(bodyUrl, 'wasm_fetch'));
  assert.equal(bodyCalls, 1);
  assert.ok(workerModule.firstAssetError('ticket').diagnostics.resources.some(resource => resource.url === bodyUrl && resource.phase === 'wasm_fetch' && resource.outcome === 'failure'));

  // ヘッダーだけ届いて本文が停止しても、30秒後に中断して失敗を通知する。
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
    const stalled = assert.rejects(workerModule.fetchAsset(stalledUrl, 'ticket_graph_fetch'));
    await new Promise(resolve => setImmediate(resolve));
    t.mock.timers.tick(30_000);
    await new Promise(resolve => setImmediate(resolve));
    await stalled;
    assert.equal(aborted, true);
    assert.equal(stalledCalls, 1);
    assert.ok(workerModule.firstAssetError('ticket').diagnostics.resources.some(resource => resource.url === stalledUrl && resource.phase === 'ticket_graph_fetch' && resource.timedOut === true));
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
  assert.equal(events.length, before + 2);

});
