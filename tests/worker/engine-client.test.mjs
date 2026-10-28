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
    fail(data = {}) { this.onerror(data); }
  };
  const clients = [];
  function client() { const client = createEngineClient({ isolated: !shared }); clients.push(client); return client; }
  t.after(() => { clients.forEach(client => client.terminate()); globalThis.Worker = original; delete globalThis.workerErrors; });
  return { workers, client };
}

test('同時待機は能力をまたいで1回の再起動を共有し、終了した画面だけを取り除く', async t => {
  const { workers, client } = setup(t, true);
  const a = client(), b = client(), c = client();
  const pendingA = a.ensureReady('ticket'), pendingB = b.ensureReady('pass'), pendingC = c.ensureReady('ticket');
  const cancelled = assert.rejects(pendingC, { name: 'AbortError' });
  workers[0].reply(failure());
  assert.equal(workers.length, 2);
  c.terminate();
  workers[1].reply({ type: 'ready', capability: 'ticket', retryCount: 0 });
  workers[1].reply({ type: 'ready', capability: 'pass', retryCount: 0 });
  for (const info of await Promise.all([pendingA, pendingB])) {
    assert.equal(info.workerRestartCount, 1);
    assert.equal(info.recovered, true);
    assert.equal(info.initialError.diagnostics.exception.stack, 'original-stack');
    assert.equal(info.initialError.diagnostics.workerUrl, workers[0].url);
  }
  await cancelled;
});

test('連続失敗は両試行を保持し、手動再試行まで再起動しない', async t => {
  const { workers, client } = setup(t);
  const a = client();
  const result = assert.rejects(a.ensureReady('ticket'), error => {
    assert.equal(error.details.workerRestartCount, 1);
    assert.equal(error.details.diagnostics.attempts.length, 2);
    assert.equal(error.details.diagnostics.attempts[0].diagnostics.resources[0].url, '/engine/main.wasm?version=old');
    return true;
  });
  workers[0].reply(failure());
  workers[1].reply(failure({ error: 'second failure' }));
  await result;
  await assert.rejects(a.ensureReady('ticket'));
  assert.equal(workers.length, 2);
  a.restart();
  const retried = a.ensureReady('ticket');
  workers[2].reply({ type: 'ready', capability: 'ticket' });
  assert.equal((await retried).recovered, false);
});

test('初期化タイムアウトは各試行30秒で打ち切り、最後の段階を保持する', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { workers, client } = setup(t);
  const a = client();
  const result = assert.rejects(a.ensureReady('pass'), error => {
    assert.equal(error.details.diagnostics.attempts.length, 2);
    assert.equal(error.details.diagnostics.attempts[0].diagnostics.phases.wasm.phase, 'wasm_fetch');
    return true;
  });
  workers[0].reply({ type: 'initialization_progress', diagnostics: { phases: { wasm: { phase: 'wasm_fetch', state: 'started', elapsedMs: 3 } } } });
  t.mock.timers.tick(29_000);
  assert.equal(workers.length, 1);
  t.mock.timers.tick(1_001);
  assert.equal(workers.length, 2);
  t.mock.timers.tick(30_001);
  await result;
});

test('実行中要求がある場合は再起動せず計算を再送しない', async t => {
  const { workers, client } = setup(t, true);
  const a = client();
  a.restart();
  const b = client();
  a.postMessage({ type: 'calculate', payload: { requestId: 'calculation' } });
  const result = assert.rejects(b.ensureReady('pass'), error => error.details.diagnostics.recoverySuppressed === 'active_requests');
  a.terminate();
  workers[0].fail({ message: '', error: new TypeError('original'), filename: '/worker.js', lineno: 4, colno: 2 });
  await result;
  await assert.rejects(b.ensureReady('pass'));
  assert.equal(workers.length, 1);
  assert.equal(workers[0].sent.length, 1);
  assert.equal(globalThis.workerErrors[0].details.diagnostics.exception.line, 4);
});

test('古いWorkerの遅延通知を無視し、成功後の追加送信を増やさない', async t => {
  const { workers, client } = setup(t);
  const a = client(), pending = a.ensureReady('ticket');
  workers[0].fail({});
  assert.equal(globalThis.workerErrors.length, 1);
  workers[0].reply({ type: 'ready', capability: 'ticket' });
  workers[0].fail({ message: 'late' });
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
