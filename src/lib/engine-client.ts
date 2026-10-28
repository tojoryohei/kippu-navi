import { SearchOperationError, isRetryableEngineError, isBusinessSearchError, type EngineCapability, type SearchDiagnostics, type SearchErrorDetails, type SearchErrorStage } from "@/lib/search-errors";
import { copyDiagnostics, exceptionDiagnostics } from "@/lib/error-diagnostics";
import { captureUnhandledError } from "@/lib/analytics";
import engineWorkerUrl from "../app/split/split.worker.ts?worker&url";

export interface EngineReadiness {
  capability: EngineCapability;
  recovered: boolean;
  retryCount: number;
  workerRestartCount: number;
  recoveryMs: number;
  initialError?: SearchErrorDetails;
  diagnostics?: SearchDiagnostics;
}
export interface EngineClient {
  onmessage: ((event: MessageEvent) => void) | null;
  ensureReady(capability: EngineCapability): Promise<EngineReadiness>;
  postMessage(message: { type: string; payload: Record<string, unknown> }): void;
  restart(): void;
  terminate(): void;
}
type Waiter = { client: EngineClient; resolve: (value: EngineReadiness) => void; reject: (reason: Error) => void };
const CAPABILITIES: EngineCapability[] = ["ticket", "pass"];
const ENGINE_READY_TIMEOUT_MS = 30_000;

function createEnginePool(isolated = false) {
  let worker: Worker | null = null;
  let sequence = 0, generation = 0, workerRestartCount = 0, cycleStartedAt = 0, deadline = 0;
  let initialError: SearchErrorDetails | undefined;
  let runtimeDiagnostics: SearchDiagnostics = {};
  const clients = new Set<EngineClient>();
  const requests = new Map<number, { client: EngineClient; requestId: unknown }>();
  const ready = new Map<EngineCapability, EngineReadiness>();
  const failures = new Map<EngineCapability, SearchErrorDetails>();
  const waiters = new Map<EngineCapability, Set<Waiter>>(CAPABILITIES.map(capability => [capability, new Set()]));
  const timers = new Map<EngineCapability, ReturnType<typeof setTimeout>>();

  function notify(client: EngineClient, data: unknown) {
    if (clients.has(client)) client.onmessage?.(new MessageEvent("message", { data }));
  }
  function clearTimer(capability: EngineCapability) {
    clearTimeout(timers.get(capability));
    timers.delete(capability);
  }
  function diagnostics(value?: SearchDiagnostics): SearchDiagnostics {
    return copyDiagnostics({ workerUrl: engineWorkerUrl, ...runtimeDiagnostics, ...value, generation })!;
  }
  function structuredFailure(data: Record<string, unknown>): SearchErrorDetails {
    return {
      message: String(data.error || "計算エンジンの初期化に失敗しました。"),
      code: (data.errorCode as SearchErrorDetails["code"]) || "engine_initialization_failed",
      source: "worker", stage: (data.errorStage as SearchErrorStage) || "worker_bootstrap",
      exceptionName: String(data.exceptionName || "Error"),
      httpStatus: typeof data.httpStatus === "number" ? data.httpStatus : undefined,
      capability: data.capability as EngineCapability | undefined,
      retryable: Boolean(data.retryable), retryCount: Number(data.retryCount || 0), workerRestartCount,
      diagnostics: diagnostics(data.diagnostics as SearchDiagnostics | undefined),
    };
  }
  function settleReady(capability: EngineCapability, retryCount: number, assetError?: SearchErrorDetails, value?: SearchDiagnostics) {
    if (!waiters.has(capability) || failures.has(capability)) return;
    clearTimer(capability);
    const info: EngineReadiness = {
      capability, recovered: workerRestartCount > 0 || retryCount > 0 || Boolean(assetError), retryCount,
      workerRestartCount, recoveryMs: cycleStartedAt ? performance.now() - cycleStartedAt : 0,
      initialError: initialError || assetError, diagnostics: diagnostics(value),
    };
    ready.set(capability, info);
    for (const waiter of waiters.get(capability)!) waiter.resolve(info);
    waiters.get(capability)!.clear();
  }
  function withHistory(details: SearchErrorDetails) {
    const current = { ...details, workerRestartCount, diagnostics: diagnostics(details.diagnostics) };
    if (initialError) current.diagnostics.attempts = [initialError, current].map(error => ({
      code: error.code, stage: error.stage, diagnostics: copyDiagnostics({ ...error.diagnostics, attempts: undefined }),
    }));
    return current;
  }
  function rejectFailures() {
    for (const [capability, failure] of failures) {
      clearTimer(capability);
      for (const waiter of waiters.get(capability)!) waiter.reject(new SearchOperationError(failure));
      waiters.get(capability)!.clear();
    }
  }
  function stopWorker() {
    generation++;
    worker?.terminate();
    worker = null;
    for (const capability of CAPABILITIES) clearTimer(capability);
    ready.clear();
    runtimeDiagnostics = {};
  }
  function recover(details: SearchErrorDetails): boolean {
    if (workerRestartCount !== 0 || details.diagnostics?.recoverySuppressed || requests.size > 0
      || isBusinessSearchError(details) || !isRetryableEngineError(new SearchOperationError(details))) return false;
    initialError = details;
    workerRestartCount = 1;
    stopWorker();
    failures.clear();
    deadline = performance.now() + ENGINE_READY_TIMEOUT_MS;
    initialize();
    for (const capability of CAPABILITIES) armTimeout(capability);
    return true;
  }
  function settleFailure(details: SearchErrorDetails) {
    const failure = withHistory(details);
    if (requests.size > 0) failure.diagnostics.recoverySuppressed = "active_requests";
    const targets = failure.capability ? [failure.capability] : CAPABILITIES;
    for (const capability of targets) {
      ready.delete(capability);
      failures.set(capability, { ...failure, capability });
    }
    if (targets.some(capability => waiters.get(capability)!.size > 0) && recover(failure)) return;
    rejectFailures();
  }
  function initialize() {
    if (worker) return;
    const currentGeneration = ++generation;
    try {
      // Viteが生成したURLを起動と診断の両方に使う。
      worker = new Worker(engineWorkerUrl, { type: "module" });
    } catch (error) {
      const original = exceptionDiagnostics(error);
      settleFailure({ message: original.message || "計算エンジンを起動できませんでした。", code: "worker_creation_failed", source: "client", stage: "worker_create", exceptionName: original.name, retryable: typeof Worker !== "undefined", retryCount: 0, workerRestartCount, diagnostics: { exception: original } });
      return;
    }
    worker.onmessage = event => {
      if (currentGeneration !== generation) return;
      const { type, requestId, capability } = event.data;
      if (type === "initialization_progress") {
        runtimeDiagnostics = diagnostics(event.data.diagnostics);
      } else if (type === "ready") {
        settleReady(capability, Number(event.data.retryCount || 0), event.data.initialError, event.data.diagnostics);
        clients.forEach(client => notify(client, event.data));
      } else if (type === "initialization_error") {
        settleFailure(structuredFailure(event.data));
      } else {
        const request = requests.get(requestId);
        if (type !== "progress" && type !== "partial_result") requests.delete(requestId);
        if (request) notify(request.client, { ...event.data, requestId: request.requestId });
      }
    };
    worker.onerror = event => {
      if (currentGeneration !== generation) return;
      const details = withHistory({ message: event.message || "計算エンジンの読み込みに失敗しました。", code: "worker_runtime_failed", source: "worker", stage: "worker_bootstrap", exceptionName: "ErrorEvent", retryable: true, retryCount: 0, workerRestartCount, diagnostics: diagnostics({ exception: exceptionDiagnostics(event.error, event) }) });
      if (requests.size > 0) details.diagnostics.recoverySuppressed = "active_requests";
      captureUnhandledError(new SearchOperationError(details), "calculation_web_worker");
      for (const request of requests.values()) notify(request.client, { type: "error", requestId: request.requestId, error: details.message, details });
      requests.clear();
      settleFailure(details);
    };
  }
  function armTimeout(capability: EngineCapability) {
    if (!waiters.get(capability)!.size || timers.has(capability) || ready.has(capability) || failures.has(capability)) return;
    const currentGeneration = generation;
    timers.set(capability, setTimeout(() => {
      timers.delete(capability);
      if (currentGeneration !== generation) return;
      settleFailure({ message: "計算エンジンの初期化がタイムアウトしました。", code: "engine_initialization_timeout", source: "client", stage: "worker_bootstrap", capability, exceptionName: "TimeoutError", retryable: true, retryCount: 0, workerRestartCount, elapsedMs: Math.round(performance.now() - cycleStartedAt), diagnostics: diagnostics({ abortReason: "timeout" }) });
    }, Math.max(0, deadline - performance.now())));
  }
  function cancelWaiters(reason: string, client?: EngineClient) {
    for (const [capability, pending] of waiters) {
      for (const waiter of pending) if (!client || waiter.client === client) {
        pending.delete(waiter);
        waiter.reject(new DOMException(reason, "AbortError"));
      }
      if (!pending.size) clearTimer(capability);
    }
  }
  function createClient(): EngineClient {
    // 失敗した生成を画面数だけ繰り返さない。
    if (!failures.size) initialize();
    const client: EngineClient = {
      onmessage: null,
      ensureReady(capability) {
        if (!clients.has(client)) return Promise.reject(new DOMException("Disposed", "AbortError"));
        const cached = ready.get(capability);
        if (cached) return Promise.resolve(cached);
        if (!deadline) { cycleStartedAt = performance.now(); deadline = cycleStartedAt + ENGINE_READY_TIMEOUT_MS; }
        return new Promise((resolve, reject) => {
          waiters.get(capability)!.add({ client, resolve, reject });
          const failure = failures.get(capability);
          if (failure) {
            if (!recover(failure)) rejectFailures();
          } else armTimeout(capability);
        });
      },
      postMessage(message) {
        if (!clients.has(client) || !worker) return;
        const requestId = ++sequence;
        requests.set(requestId, { client, requestId: message.payload.requestId });
        worker.postMessage({ ...message, payload: { ...message.payload, requestId } });
      },
      restart() {
        if (!clients.has(client)) return;
        cancelWaiters("Superseded");
        stopWorker();
        requests.clear();
        failures.clear();
        workerRestartCount = 0; initialError = undefined; deadline = 0; cycleStartedAt = 0;
        initialize();
      },
      terminate() {
        clients.delete(client);
        cancelWaiters("Disposed", client);
        // 画面が消えてもWorker内の計算は継続するため、終端通知まで実行中として扱う。
        client.onmessage = null;
        if (isolated && clients.size === 0) { stopWorker(); requests.clear(); }
      },
    };
    clients.add(client);
    queueMicrotask(() => {
      if (!clients.has(client)) return;
      for (const [capability] of ready) notify(client, { type: "ready", capability });
    });
    return client;
  }
  return createClient;
}
const sharedEngine = createEnginePool();
export function createEngineClient(options: { isolated?: boolean } = {}): EngineClient {
  return options.isolated ? createEnginePool(true)() : sharedEngine();
}
