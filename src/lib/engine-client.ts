import { SearchOperationError, type EngineCapability, type SearchErrorDetails, type SearchErrorStage } from "@/lib/search-errors";
import { captureUnhandledError } from "@/lib/analytics";

export interface EngineReadiness {
  capability: EngineCapability;
  recovered: boolean;
  retryCount: number;
  workerRestartCount: number;
  recoveryMs: number;
  initialError?: SearchErrorDetails;
}

export interface EngineClient {
  onmessage: ((event: MessageEvent) => void) | null;
  ensureReady(capability: EngineCapability): Promise<EngineReadiness>;
  postMessage(message: { type: string; payload: Record<string, unknown> }): void;
  restart(): void;
  terminate(): void;
}

type Waiter = { resolve: (retryCount: number) => void; reject: (reason: SearchOperationError) => void };
let worker: Worker | null = null;
let sequence = 0;
let generation = 0;
const clients = new Set<EngineClient>();
const requests = new Map<number, { client: EngineClient; requestId: unknown }>();
const ready = new Map<EngineCapability, number>();
const failures = new Map<EngineCapability, SearchErrorDetails>();
const waiters = new Map<EngineCapability, Set<Waiter>>([["ticket", new Set()], ["pass", new Set()]]);
const ENGINE_READY_TIMEOUT_MS = 30_000;

function notify(client: EngineClient, data: unknown) {
  client.onmessage?.(new MessageEvent("message", { data }));
}

function structuredFailure(data: Record<string, unknown>, restartCount = 0): SearchErrorDetails {
  return {
    message: String(data.error || "計算エンジンの初期化に失敗しました。"),
    code: (data.errorCode as SearchErrorDetails["code"]) || "engine_initialization_failed",
    source: "worker",
    stage: (data.errorStage as SearchErrorStage) || "worker_bootstrap",
    exceptionName: String(data.exceptionName || "Error"),
    httpStatus: typeof data.httpStatus === "number" ? data.httpStatus : undefined,
    capability: data.capability as EngineCapability | undefined,
    retryable: Boolean(data.retryable),
    retryCount: Number(data.retryCount || 0),
    workerRestartCount: restartCount,
  };
}

function settleReady(capability: EngineCapability, retryCount: number) {
  ready.set(capability, retryCount);
  failures.delete(capability);
  for (const waiter of waiters.get(capability)!) waiter.resolve(retryCount);
  waiters.get(capability)!.clear();
}

function settleFailure(details: SearchErrorDetails) {
  const targets = details.capability ? [details.capability] : (["ticket", "pass"] as EngineCapability[]);
  for (const capability of targets) {
    const targeted = { ...details, capability };
    failures.set(capability, targeted);
    for (const waiter of waiters.get(capability)!) waiter.reject(new SearchOperationError(targeted));
    waiters.get(capability)!.clear();
  }
}

function createWorker(): Worker {
  try {
    return new Worker(new URL("../app/split/split.worker.ts", import.meta.url), { type: "module" });
  } catch (error) {
    const exception = error instanceof Error ? error : new Error(String(error));
    throw new SearchOperationError({ message: exception.message, code: "worker_creation_failed", source: "client", stage: "worker_create", exceptionName: exception.name, retryable: true, retryCount: 0, workerRestartCount: 0 });
  }
}

function initialize() {
  if (worker) return;
  try {
    worker = createWorker();
  } catch (error) {
    const details = error instanceof SearchOperationError ? error.details : { message: String(error), code: "worker_creation_failed" as const, source: "client" as const, stage: "worker_create" as const, retryable: true, retryCount: 0, workerRestartCount: 0 };
    settleFailure(details);
    return;
  }
  const currentGeneration = ++generation;
  worker.onmessage = event => {
    if (currentGeneration !== generation) return;
    const { type, requestId, capability } = event.data;
    if (type === "ready") {
      settleReady(capability, Number(event.data.retryCount || 0));
      clients.forEach(client => notify(client, event.data));
    } else if (type === "initialization_error") {
      const details = structuredFailure(event.data);
      settleFailure(details);
    } else {
      const request = requests.get(requestId);
      requests.delete(requestId);
      if (request) notify(request.client, { ...event.data, requestId: request.requestId });
    }
  };
  worker.onerror = event => {
    const details: SearchErrorDetails = { message: event.message || "計算エンジンの読み込みに失敗しました。", code: "worker_runtime_failed", source: "worker", stage: "worker_bootstrap", exceptionName: "ErrorEvent", retryable: true, retryCount: 0, workerRestartCount: 0 };
    settleFailure(details);
    captureUnhandledError(new SearchOperationError(details), "calculation_web_worker");
    requests.clear();
  };
}

function resetWorker() {
  worker?.terminate();
  worker = null;
  generation++;
  ready.clear();
  failures.clear();
  requests.clear();
  initialize();
}

function waitUntilReady(capability: EngineCapability, timeoutMs = 15_000, startedAt = performance.now()): Promise<number> {
  const retryCount = ready.get(capability);
  if (retryCount !== undefined) return Promise.resolve(retryCount);
  const failure = failures.get(capability);
  if (failure) return Promise.reject(new SearchOperationError(failure));
  return new Promise((resolve, reject) => {
    const waiter: Waiter = { resolve, reject };
    waiters.get(capability)!.add(waiter);
    setTimeout(() => {
      if (!waiters.get(capability)!.delete(waiter)) return;
      reject(new SearchOperationError({ message: "計算エンジンの初期化がタイムアウトしました。", code: "engine_initialization_timeout", source: "client", stage: "worker_bootstrap", capability, exceptionName: "TimeoutError", retryable: true, retryCount: 0, workerRestartCount: 0, elapsedMs: Math.round(performance.now() - startedAt) }));
    }, timeoutMs);
  });
}

function recoveredAssetFailure(capability: EngineCapability, retryCount: number): SearchErrorDetails | undefined {
  if (retryCount === 0) return undefined;
  return { message: "エンジン資材の取得を再試行しました。", code: "engine_asset_fetch_failed", source: "worker", stage: capability === "ticket" ? "ticket_graph_fetch" : "pass_graph_fetch", exceptionName: "FetchError", capability, retryable: true, retryCount, workerRestartCount: 0 };
}

export function createEngineClient(): EngineClient {
  initialize();
  const client: EngineClient = {
    onmessage: null,
    async ensureReady(capability) {
      const startedAt = performance.now();
      try {
        const retryCount = await waitUntilReady(capability, ENGINE_READY_TIMEOUT_MS, startedAt);
        return { capability, recovered: retryCount > 0, retryCount, workerRestartCount: 0, recoveryMs: performance.now() - startedAt, initialError: recoveredAssetFailure(capability, retryCount) };
      } catch (firstError) {
        const initial = firstError instanceof SearchOperationError ? firstError : null;
        if (!initial?.details.retryable) throw firstError;
        throw firstError;
      }
    },
    postMessage(message) {
      if (!clients.has(client) || !worker) return;
      const requestId = ++sequence;
      requests.set(requestId, { client, requestId: message.payload.requestId });
      worker.postMessage({ ...message, payload: { ...message.payload, requestId } });
    },
    restart() {
      resetWorker();
    },
    terminate() {
      clients.delete(client);
      for (const [id, request] of requests) if (request.client === client) requests.delete(id);
      client.onmessage = null;
    },
  };
  clients.add(client);
  queueMicrotask(() => {
    if (!clients.has(client)) return;
    for (const [capability] of ready) notify(client, { type: "ready", capability });
  });
  return client;
}
