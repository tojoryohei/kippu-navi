// ClientRouterの画面遷移を跨いで一つのWASMインスタンスを共有する。
// フォームの終了は購読だけを解除し、Workerはタブの寿命まで保持する。
export interface EngineClient {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage(message: {
    type: string;
    payload: Record<string, unknown>;
  }): void;
  terminate(): void;
}

let worker: Worker | null = null;
let ready = false;
let failure: string | null = null;
let sequence = 0;
const clients = new Set<EngineClient>();
const requests = new Map<
  number,
  { client: EngineClient; requestId: unknown }
>();

function notify(client: EngineClient, data: unknown) {
  client.onmessage?.(new MessageEvent("message", { data }));
}

function initialize() {
  if (worker) return;
  worker = new Worker(new URL("../app/split/split.worker.ts", import.meta.url));
  worker.onmessage = (event) => {
    const { type, requestId } = event.data;
    if (type === "ready") {
      ready = true;
      clients.forEach((client) => notify(client, event.data));
    } else if (type === "error" && requestId === undefined) {
      failure = String(event.data.error);
      clients.forEach((client) => notify(client, event.data));
    } else {
      const request = requests.get(requestId);
      requests.delete(requestId);
      if (request)
        notify(request.client, { ...event.data, requestId: request.requestId });
    }
  };
  worker.onerror = (event) => {
    ready = false;
    failure =
      event.message ||
      "計算エンジンの読み込みに失敗しました。ページを再読み込みしてください。";
    requests.clear();
    clients.forEach((client) =>
      notify(client, { type: "error", error: failure }),
    );
  };
}

export function createEngineClient(): EngineClient {
  initialize();
  const client: EngineClient = {
    onmessage: null,
    postMessage(message) {
      if (!clients.has(client)) return;
      const requestId = ++sequence;
      requests.set(requestId, { client, requestId: message.payload.requestId });
      worker!.postMessage({
        ...message,
        payload: { ...message.payload, requestId },
      });
    },
    terminate() {
      clients.delete(client);
      for (const [id, request] of requests) {
        if (request.client === client) requests.delete(id);
      }
      client.onmessage = null;
    },
  };
  clients.add(client);
  queueMicrotask(() => {
    if (!clients.has(client)) return;
    if (failure) notify(client, { type: "error", error: failure });
    else if (ready) notify(client, { type: "ready" });
  });
  return client;
}
