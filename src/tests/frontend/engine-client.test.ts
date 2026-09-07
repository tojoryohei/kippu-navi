import { beforeEach, afterEach, expect, test, vi } from "vitest";

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: { message: string }) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() {
    FakeWorker.instances.push(this);
  }
  emit(data: unknown) {
    this.onmessage?.(new MessageEvent("message", { data }));
  }
}

beforeEach(() => {
  vi.resetModules();
  FakeWorker.instances = [];
  vi.stubGlobal("Worker", FakeWorker);
});
afterEach(() => vi.unstubAllGlobals());

test("同じローカルIDの並行要求でも結果とエラーを元の画面にだけ返す", async () => {
  const { createEngineClient } = await import("@/lib/engine-client");
  const a = createEngineClient();
  const b = createEngineClient();
  const onA = vi.fn();
  const onB = vi.fn();
  a.onmessage = onA;
  b.onmessage = onB;
  a.postMessage({ type: "calculate", payload: { requestId: 1 } });
  b.postMessage({ type: "calculate", payload: { requestId: 1 } });
  const worker = FakeWorker.instances[0];
  const idA = worker.postMessage.mock.calls[0][0].payload.requestId;
  const idB = worker.postMessage.mock.calls[1][0].payload.requestId;
  expect(idA).not.toBe(idB);
  worker.emit({ type: "success", requestId: idA, result: 160 });
  worker.emit({ type: "error", requestId: idB, error: "invalid route" });
  expect(onA).toHaveBeenCalledTimes(1);
  expect(onA.mock.calls[0][0].data).toEqual({
    type: "success",
    requestId: 1,
    result: 160,
  });
  expect(onB).toHaveBeenCalledTimes(1);
  expect(onB.mock.calls[0][0].data).toEqual({
    type: "error",
    requestId: 1,
    error: "invalid route",
  });
});

test("画面終了後の応答を破棄し、次の画面では同じWorkerのreadyを受け取る", async () => {
  const { createEngineClient } = await import("@/lib/engine-client");
  const first = createEngineClient();
  first.postMessage({ type: "calculate", payload: { requestId: 1 } });
  const worker = FakeWorker.instances[0];
  const oldId = worker.postMessage.mock.calls[0][0].payload.requestId;
  first.terminate();
  worker.emit({ type: "ready" });
  const next = createEngineClient();
  const onNext = vi.fn();
  next.onmessage = onNext;
  await Promise.resolve();
  worker.emit({ type: "success", requestId: oldId, result: 999 });
  expect(FakeWorker.instances).toHaveLength(1);
  expect(worker.terminate).not.toHaveBeenCalled();
  expect(onNext).toHaveBeenCalledTimes(1);
  expect(onNext.mock.calls[0][0].data).toEqual({ type: "ready" });
});

test("初期化失敗を遷移後の画面にも伝える", async () => {
  const { createEngineClient } = await import("@/lib/engine-client");
  createEngineClient().terminate();
  FakeWorker.instances[0].emit({ type: "error", error: "WASM 404" });
  const next = createEngineClient();
  const onNext = vi.fn();
  next.onmessage = onNext;
  await Promise.resolve();
  expect(onNext.mock.calls[0][0].data).toEqual({
    type: "error",
    error: "WASM 404",
  });
});
