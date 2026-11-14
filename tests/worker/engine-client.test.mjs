import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// 応答を制御できるWorker通信で、実際のリクエスト振り分けを検証する。
test('経路入力の進捗と経路自動の途中結果は終端まで通知先を保持する', async () => {
  const originalWorker = globalThis.Worker;
  let transport;
  globalThis.Worker = class {
    sent = [];
    constructor() { transport = this; }
    postMessage(message) { this.sent.push(message); }
    terminate() {}
    reply(data) { this.onmessage({ data }); }
  };
  // Nodeでも実ソースを読み込み、ブラウザ専用の計測依存だけを置き換える。
  const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
    if (specifier.endsWith('?worker&url')) return { url: 'data:text/javascript,export default "/_astro/split.worker-test.js"', shortCircuit: true };
    if (specifier === "@/lib/error-diagnostics") return { url: new URL('../../src/lib/error-diagnostics.ts', import.meta.url).href, shortCircuit: true };
    if (specifier === "@/lib/analytics") return { url: "data:text/javascript,export const captureUnhandledError = () => {}", shortCircuit: true };
    if (specifier === "@/lib/search-errors") return { url: new URL('../../src/lib/search-errors.ts', import.meta.url).href, shortCircuit: true };
    if (specifier === "@/pwa/status") return { url: new URL('../../src/pwa/status.ts', import.meta.url).href, shortCircuit: true };
    return nextResolve(specifier, context);
  } });
  try {
    const { createEngineClient } = await import('../../src/lib/engine-client.ts');
    const a = createEngineClient();
    const b = createEngineClient();
    const aEvents = [], bEvents = [];
    a.onmessage = e => aEvents.push(e.data);
    b.onmessage = e => bEvents.push(e.data);
    a.postMessage({ type: 'calculateRouteSplitTicket', payload: { requestId: 1 } });
    b.postMessage({ type: 'calculateOptimalSplitPass', payload: { requestId: 1 } });
    const [idA, idB] = transport.sent.map(message => message.payload.requestId);
    for (const completed of [0, 3, 6]) transport.reply({ type: 'progress', requestId: idA, completed, total: 6 });
    transport.reply({ type: 'partial_result', requestId: idB, result: { results: [2] } });
    transport.reply({ type: 'success_route_split_ticket', requestId: idA, result: {} });
    transport.reply({ type: 'error', requestId: idB, error: 'failed' });
    transport.reply({ type: 'progress', requestId: idA, completed: 6, total: 6 });
    assert.deepEqual(aEvents.map(e => e.type), ['progress', 'progress', 'progress', 'success_route_split_ticket']);
    assert.deepEqual(bEvents.map(e => e.type), ['partial_result', 'error']);
    assert.ok([...aEvents, ...bEvents].every(e => e.requestId === 1));
    a.terminate(); b.terminate();
  } finally { hooks.deregister(); globalThis.Worker = originalWorker; }
});

const hooks = registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('?worker&url')) return { url: 'data:text/javascript,export default "/_astro/split.worker-test.js"', shortCircuit: true };
  if (specifier === "@/lib/analytics") return { url: 'data:text/javascript,export const captureUnhandledError = (error) => globalThis.workerErrors?.push(error)', shortCircuit: true };
  if (specifier.startsWith('@/')) return { url: new URL('../../src/' + specifier.slice(2) + '.ts', import.meta.url).href, shortCircuit: true };
  return nextResolve(specifier, context);
} });
const { createEngineClient } = await import('../../src/lib/engine-client.ts?recovery');
hooks.deregister();
const failure = (extra = {}) => ({ type: 'initialization_error', error: 'Load failed', errorCode: 'engine_asset_fetch_failed', errorStage: 'wasm_fetch', exceptionName: 'TypeError', retryable: true, diagnostics: { exception: { message: 'Load failed', stack: 'original-stack' }, resources: [{ url: '/engine/main.wasm?version=old', phase: 'wasm_fetch', attempt: 3, elapsedMs: 8, outcome: 'failure' }] }, ...extra });

function setup(t, shared = false) {
  const original = globalThis.Worker;
  const workers = [];
  globalThis.workerErrors = [];
  globalThis.Worker = class {
    sent = []; stopped = false;
    constructor(url) { this.url = url; workers.push(this); }
    postMessage(data) { this.sent.push(data); }
    terminate() { this.stopped = true; }
    reply(data) { this.onmessage({ data }); }
    fail(data = {}) { return this.onerror(data); }
  };
  const clients = [];
  function client() { const client = createEngineClient({ isolated: !shared }); clients.push(client); return client; }
  t.after(() => { clients.forEach(client => client.terminate()); globalThis.Worker = original; delete globalThis.workerErrors; });
  return { workers, client };
}

test('失敗を共有し、自動再起動せず通常の計算操作から再開できる', async t => {
  const { workers, client } = setup(t, true);
  const a = client(), b = client(), c = client();
  const pendingA = assert.rejects(a.ensureReady('ticket'), error => {
    assert.equal(error.details.workerRestartCount, 0);
    assert.equal(error.details.diagnostics.exception.stack, 'original-stack');
    return true;
  });
  const pendingB = assert.rejects(b.ensureReady('pass'));
  const cancelled = assert.rejects(c.ensureReady('ticket'), { name: 'AbortError' });
  c.terminate();
  workers[0].reply(failure());
  await Promise.all([pendingA, pendingB, cancelled]);
  await assert.rejects(a.ensureReady('ticket'));
  assert.equal(workers.length, 1);
  assert.equal(a.getState('ticket').status, 'failed');
  a.restart();
  const pending = a.ensureReady('ticket');
  workers[1].reply({ type: 'ready', capability: 'ticket' });
  const readiness = await pending;
  assert.equal(readiness.recovered, true);
  assert.equal(readiness.workerRestartCount, 1);
  assert.equal(readiness.initialError.diagnostics.exception.stack, 'original-stack');
});

test('進捗のない初期化は各試行60秒で打ち切り、最後の段階を保持する', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { workers, client } = setup(t);
  const a = client();
  const environment = assert.rejects(a.ensureEnvironmentSupported(), error => error.details.code === 'engine_initialization_timeout');
  const result = assert.rejects(a.ensureReady('pass'), error => {
    assert.equal(error.details.diagnostics.phases.wasm.phase, 'wasm_fetch');
    return true;
  });
  workers[0].reply({ type: 'initialization_progress', diagnostics: { phases: { wasm: { phase: 'wasm_fetch', state: 'started', elapsedMs: 3 } } } });
  t.mock.timers.tick(59_000);
  assert.equal(workers.length, 1);
  t.mock.timers.tick(1_001);
  assert.equal(workers.length, 1);
  await Promise.all([result, environment]);
});

test('起動前の後追い取得が停止しても2秒で元の失敗を一度だけ返す', async t => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  globalThis.window = { location: new URL('https://example.test/fare/ticket') };
  t.after(() => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { workers, client } = setup(t);
  const a = client();
  let requests = 0;
  globalThis.fetch = (_url, { signal }) => new Promise((_resolve, reject) => {
    requests++;
    signal.addEventListener('abort', () => reject(new DOMException('probe timeout', 'AbortError')), { once: true });
  });
  const pending = assert.rejects(a.ensureReady('ticket'), error => {
    assert.equal(error.details.code, 'worker_runtime_failed');
    assert.equal(error.details.diagnostics.workerScriptProbe.exception.name, 'AbortError');
    return true;
  });
  const notification = workers[0].fail({});
  const alsoPending = assert.rejects(a.ensureReady('pass'));
  await workers[0].fail({});
  t.mock.timers.tick(2_000);
  await notification;
  await Promise.all([pending, alsoPending]);
  assert.equal(requests, 1);
  assert.equal(globalThis.workerErrors.length, 1);
});

test('実行中要求がある場合は再起動せず計算を再送しない', async t => {
  const { workers, client } = setup(t, true);
  const a = client();
  a.restart();
  const b = client();
  workers[0].reply({ type: 'ready', capability: 'ticket' });
  a.postMessage({ type: 'calculate', payload: { requestId: 'calculation' } });
  const result = assert.rejects(b.ensureReady('pass'), error => {
    const { diagnostics } = error.details;
    assert.equal(diagnostics.recoverySuppressed, 'active_requests');
    assert.equal(diagnostics.workerPhase, 'after_ready');
    assert.deepEqual(diagnostics.workerReadyCapabilities, ['ticket']);
    return true;
  });
  a.terminate();
  workers[0].fail({ message: '', error: new TypeError('original'), filename: '/worker.js', lineno: 4, colno: 2 });
  await result;
  await assert.rejects(b.ensureReady('pass'));
  assert.equal(workers.length, 1);
  assert.equal(workers[0].sent.length, 1);
  assert.equal(globalThis.workerErrors[0].details.diagnostics.exception.line, 4);
});

test('手動再開後は古いWorkerの遅延通知を無視する', async t => {
  const { workers, client } = setup(t);
  const a = client();
  const failed = assert.rejects(a.ensureReady('ticket'), error => {
    const { diagnostics } = error.details;
    assert.equal(diagnostics.workerPhase, 'initializing');
    assert.equal(diagnostics.phases.wasm.phase, 'wasm_fetch');
    return true;
  });
  workers[0].reply({ type: 'initialization_progress', diagnostics: { phases: { wasm: { phase: 'wasm_fetch', state: 'started', elapsedMs: 5 } } } });
  workers[0].fail({});
  await failed;
  a.restart();
  const pending = a.ensureReady('ticket');
  workers[0].reply({ type: 'initialization_progress' });
  workers[0].reply({ type: 'ready', capability: 'ticket' });
  workers[0].fail({ message: 'late' });
  assert.equal(a.getState('ticket').status, 'preparing');
  workers[1].reply({ type: 'ready', capability: 'ticket' });
  assert.equal((await pending).workerRestartCount, 1);
  assert.equal(globalThis.workerErrors.length, 1);
});

test('再試行不能・業務エラーと手動世代交代では自動復旧しない', async t => {
  const { workers, client } = setup(t);
  for (const extra of [{ retryable: false }, { errorCode: 'path_invalid' }]) {
    const a = client(), worker = workers[workers.length - 1];
    const result = assert.rejects(a.ensureReady('ticket'));
    worker.reply(failure(extra));
    await result;
    assert.equal(worker.stopped, false);
    a.terminate();
  }
  const a = client(), result = assert.rejects(a.ensureReady('ticket'), { name: 'AbortError' });
  a.restart();
  await result;
});

test('進捗が続く限り準備を中断せず、能力別に状態を通知する', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { workers, client } = setup(t);
  const a = client();
  const changes = [];
  const unsubscribe = a.subscribe(() => changes.push(a.getState('ticket').status));
  const pending = a.ensureReady('ticket');
  for (let i = 0; i < 4; i++) {
    t.mock.timers.tick(40_000);
    workers[0].reply({ type: 'initialization_progress', diagnostics: { receivedBytes: i * 100 } });
  }
  assert.equal(workers.length, 1);
  workers[0].reply({ type: 'ready', capability: 'pass' });
  assert.equal(a.getState('ticket').status, 'preparing');
  workers[0].reply({ type: 'ready', capability: 'ticket' });
  await pending;
  assert.equal(a.getState('ticket').status, 'ready');
  a.restart();
  assert.equal(a.getState('ticket').status, 'preparing');
  workers[0].reply({ type: 'ready', capability: 'ticket' });
  assert.equal(a.getState('ticket').status, 'preparing');
  unsubscribe();
  const count = changes.length;
  workers[1].reply({ type: 'ready', capability: 'ticket' });
  assert.equal(changes.length, count);
});

test('環境確認だけで待機を解除し、準備完了とは分離して共有する', async t => {
  const { workers, client } = setup(t, true);
  const a = client(), b = client();
  a.restart();
  const pending = Promise.all([a.ensureEnvironmentSupported(), b.ensureEnvironmentSupported()]);
  workers.at(-1).reply({ type: 'environment_supported' });
  await pending;
  assert.equal(a.getState('ticket').status, 'preparing');
  assert.equal(a.getState('ticket').environmentSupported, true);
  await b.ensureEnvironmentSupported();
  a.restart();
  const disposed = b.ensureEnvironmentSupported();
  b.terminate();
  await assert.rejects(disposed, { name: 'AbortError' });
  workers.at(-1).reply({ type: 'environment_supported' });
  await a.ensureEnvironmentSupported();
  const failed = a.ensureReady('ticket');
  workers.at(-1).reply(failure({ errorCode: 'unsupported_environment', retryable: false }));
  await assert.rejects(failed, error => error.details.code === 'unsupported_environment');
  const count = workers.length;
  a.restart();
  assert.equal(workers.length, count);
  await assert.rejects(a.ensureEnvironmentSupported());
});

test('起動前のWorkerが404の場合は共有待機を終了し、同じURLを再起動しない', async t => {
  const originalWindow = globalThis.window, originalFetch = globalThis.fetch;
  globalThis.window = { location: new URL('https://example.test/fare/ticket') };
  globalThis.fetch = async () => new Response(null, { status: 404 });
  t.after(() => { globalThis.window = originalWindow; globalThis.fetch = originalFetch; });
  const { workers, client } = setup(t);
  const a = client();
  const pending = [a.ensureReady('ticket'), a.ensureReady('pass'), a.ensureEnvironmentSupported()]
    .map(promise => assert.rejects(promise, error => {
      assert.equal(error.details.recoveryAction, 'reload');
      assert.equal(error.details.retryable, false);
      assert.equal(error.details.diagnostics.workerScriptProbe.status, 404);
      return true;
    }));
  await workers[0].fail({});
  await Promise.all(pending);
  a.restart();
  assert.equal(workers.length, 1);
  assert.equal(globalThis.workerErrors.length, 1);
});
