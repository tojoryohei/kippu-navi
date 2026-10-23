import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

// 応答を制御できるWorker通信で、実際のリクエスト振り分けを検証する。
test('進捗通知は成功またはエラーまでリクエストを保持し、クライアント間で混在しない', async () => {
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
    b.postMessage({ type: 'calculateRouteSplitPass', payload: { requestId: 1 } });
    const [idA, idB] = transport.sent.map(message => message.payload.requestId);
    for (const completed of [0, 3, 6]) transport.reply({ type: 'progress', requestId: idA, completed, total: 6 });
    transport.reply({ type: 'progress', requestId: idB, completed: 0, total: 3 });
    transport.reply({ type: 'success_route_split_ticket', requestId: idA, result: {} });
    transport.reply({ type: 'error', requestId: idB, error: 'failed' });
    transport.reply({ type: 'progress', requestId: idA, completed: 6, total: 6 });
    assert.deepEqual(aEvents.map(e => e.type), ['progress', 'progress', 'progress', 'success_route_split_ticket']);
    assert.deepEqual(bEvents.map(e => e.type), ['progress', 'error']);
    assert.ok([...aEvents, ...bEvents].every(e => e.requestId === 1));
    a.terminate(); b.terminate();
  } finally { hooks.deregister(); globalThis.Worker = originalWorker; }
});
