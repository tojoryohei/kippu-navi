import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

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
  try {
    // ユーザー入力ではなく、リポジトリ内の固定テスト用URLを読み込む。
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 上記の固定URLのみを使用する。
    const source = await readFile(new URL('../../src/lib/engine-client.ts', import.meta.url), 'utf8');
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
      .replace(/import .* from "@\/lib\/search-errors";/, `import { SearchOperationError } from ${JSON.stringify(new URL('../../src/lib/search-errors.ts', import.meta.url).href)};`)
      .replace(/import .* from "@\/lib\/analytics";/, 'const captureUnhandledError = () => {};')
      .replace('new URL("../app/split/split.worker.ts", import.meta.url)', '"mock-worker"');
    const { createEngineClient } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
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
  } finally { globalThis.Worker = originalWorker; }
});
