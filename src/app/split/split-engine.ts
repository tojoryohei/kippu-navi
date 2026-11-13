import { normalizeWasmEnvironmentError } from "@/lib/wasm-environment";
import { readEngineAsset } from "@/lib/read-engine-asset";
import { createSplitResultStream } from "@/lib/split-result-stream";
/// <reference lib="webworker" />
import * as Sentry from "@sentry/browser";
import { classifyCalculationError, normalizeCalculationError, type SearchDiagnostics, type SearchErrorDetails } from "@/lib/search-errors";
import { exceptionDiagnostics } from "@/lib/error-diagnostics";
import { createResourceDiagnostics } from "@/lib/resource-diagnostics";
import { sentryDataCollection } from "@/lib/sentry-data-collection";

// Blob Worker環境でも正しいオリジンを抽出するヘルパー関数
function getBaseOrigin(): string {
  if (typeof self === 'undefined' || !self.location) return '';
  const href = self.location.href || '';
  let origin = (self.location.origin && self.location.origin !== 'null') ? self.location.origin : '';

  if (href.startsWith('blob:')) {
    const rawUrl = href.replace('blob:', '');
    try {
      origin = new URL(rawUrl).origin;
    } catch {
      // ignore
    }
  }

  if (origin.includes('.a.run.app')) {
    return 'https://kippu-navi.com';
  }

  return origin;
}

const baseOrigin = getBaseOrigin();
const resourceDiagnostics = createResourceDiagnostics(value => {
  postMessage({ type: 'initialization_progress', diagnostics: { ...value, workerLocation: self.location.href } });
});
function workerDiagnostics(error?: unknown): SearchDiagnostics {
  return { ...resourceDiagnostics.snapshot(), workerLocation: self.location.href, exception: error === undefined ? undefined : exceptionDiagnostics(error) };
}
function firstAssetError(capability: 'ticket' | 'pass'): SearchErrorDetails | undefined {
  const resources = resourceDiagnostics.snapshot().resources || [];
  const failure = resources.find(resource => resource.outcome === 'failure' && !resource.url.includes(capability === 'ticket' ? 'pass_graph' : 'ticket_graph'));
  if (!failure) return undefined;
  const stage = failure.phase.startsWith('ticket_') ? 'ticket_graph_fetch' : failure.phase.startsWith('pass_') ? 'pass_graph_fetch' : (failure.phase === 'wasm_fetch' || failure.phase === 'wasm_body_read') ? 'wasm_fetch' : 'worker_bootstrap';
  return { message: failure.exception?.message || 'エンジン資材の取得を再試行しました。', code: 'engine_asset_fetch_failed', source: 'worker', stage, capability, exceptionName: failure.exception?.name, httpStatus: failure.status, retryable: true, retryCount: failure.attempt - 1, workerRestartCount: 0, diagnostics: { ...workerDiagnostics(), exception: failure.exception } };
}
const sentryDsn = import.meta.env.PUBLIC_SENTRY_DSN;
postMessage({ type: 'initialization_progress', diagnostics: { workerBootstrapStage: 'sentry_initialize' } });
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tunnel: `${baseOrigin}/monitoring`,
    environment: __DEPLOY_ENVIRONMENT__,
    release: `${__APP_VERSION__}+${__DEPLOY_COMMIT__}`,
    dataCollection: sentryDataCollection,
    sendClientReports: false,
    tracesSampleRate: 0,
    integrations(defaultIntegrations) {
      return defaultIntegrations.filter(integration => integration.name !== "BrowserSession");
    },
  });
}
// CI embeds the content hash used to package all four engine files.
const wasmVersion = __WASM_VERSION__;
const engineBaseUrl = `${baseOrigin}/engine${wasmVersion ? `/${wasmVersion}` : ''}`;
interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

declare const Go: {
  new(): GoInstance;
};

type ResultCallback = (json: string) => void;

type ProgressCallback = (phase: 'calculating' | 'organizing', completed: number, total: number) => void;

function routeProgress(requestId: unknown): ProgressCallback {
  postMessage({ type: 'progress', requestId, phase: 'exploring', completed: 0, total: 0 });
  return (phase, completed, total) => postMessage({ type: 'progress', requestId, phase, completed, total });
}

interface WorkerGlobalScope {
  preparePassGraphBuffer(size: number): number;
  initPassGraphFromBuffer(size: number): boolean | string;
  prepareTicketGraphBuffer(size: number): number;
  initTicketGraphFromBuffer(size: number): boolean | string;
  reconstructAndCalculate(splitStationsJson: string, months: number, isIc: boolean, result?: ResultCallback): string;
  reconstructAndCalculateTicket(splitStationsJson: string, result?: ResultCallback): string;
  calculateRoutePass(stationNamesJson: string, months: number, isIc: boolean, calculationMode: string): string;
  calculateRouteTicket(jsonStr: string): string;
  calculateRouteSplitTicket(jsonStr: string, progress?: ProgressCallback): string;
  calculateRouteSplitPass(jsonStr: string, progress?: ProgressCallback): string;
  calculateOptimalSplitPass(request: string, result?: ResultCallback): string;
  calculateOptimalSplitTicket(startStationName: string, endStationName: string, maxSplits?: number, noSplitStationsJson?: string, result?: ResultCallback): string;
}
const workerSelf = (typeof self !== 'undefined' ? self : globalThis) as unknown as WorkerGlobalScope;

let go: GoInstance;
let wasmInstance: WebAssembly.Instance | null = null;
let ticketGraphInitialized = false;
let passGraphInitialized = false;
let wasmRetryCount = 0;

const WASM_URL = `${engineBaseUrl}/main.wasm`;
const PASS_GRAPH_URL = `${engineBaseUrl}/pass_graph_data.bin`;
const TICKET_GRAPH_URL = `${engineBaseUrl}/ticket_graph_data.bin`;

type InitStage = 'worker_bootstrap' | 'wasm_fetch' | 'wasm_instantiate' |
  'pass_graph_fetch' | 'pass_graph_initialize' | 'ticket_graph_fetch' | 'ticket_graph_initialize';

interface InitFailure {
  type: 'initialization_error';
  error: string;
  errorCode: string;
  errorStage: InitStage;
  exceptionName: string;
  httpStatus?: number;
  capability?: 'ticket' | 'pass';
  retryable: boolean;
  retryCount: number;
  diagnostics?: SearchDiagnostics;
}


function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function loadWasmRuntime() {
  const runtimeUrl = `${engineBaseUrl}/wasm_exec.js`;
  await resourceDiagnostics.measure(runtimeUrl, 'runtime_import', 1, () => import(/* @vite-ignore */ runtimeUrl));
}

async function fetchAsset(url: string, phase: string) {
  try {
    let status: number | undefined;
    let receivedBytes = 0;
    const result = await resourceDiagnostics.measure(url, phase, 1, async () => {
      const result = await readEngineAsset(url, bytes => {
        receivedBytes = bytes;
        postMessage({ type: 'initialization_progress', diagnostics: { ...workerDiagnostics(), receivedBytes, resourceUrl: url } });
      });
      status = result.status;
      receivedBytes = result.buffer.byteLength;
      return result;
    }, { status: () => status, receivedBytes: () => receivedBytes });
    return { buffer: result.buffer, retryCount: 0, url };
  } catch (error) {
    if (error && typeof error === 'object') Object.assign(error, { retryCount: 0, assetFetch: true });
    throw error;
  }
}

function initFailure(error: unknown, stage: InitStage, retryCount: number, capability?: 'ticket' | 'pass'): InitFailure {
  const normalized = stage === 'wasm_instantiate' ? normalizeWasmEnvironmentError(error, navigator.userAgent) : error;
  const exception = normalized instanceof Error ? normalized : new Error(String(normalized));
  const unsupported = exception.name === 'UnsupportedEnvironmentError';
  const httpStatus = (error as { httpStatus?: number } | null)?.httpStatus;
  return {
    type: 'initialization_error',
    error: exception.message,
    errorCode: unsupported ? 'unsupported_environment' : stage.endsWith('_fetch') ? 'engine_asset_fetch_failed'
      : stage === 'wasm_instantiate' ? 'wasm_instantiation_failed'
        : stage.endsWith('_initialize') ? 'graph_initialization_failed'
          : 'engine_initialization_failed',
    errorStage: stage,
    exceptionName: exception.name,
    httpStatus,
    capability,
    retryable: !unsupported && typeof WebAssembly !== 'undefined' && (httpStatus === undefined || isRetryableStatus(httpStatus)),
    retryCount,
    diagnostics: workerDiagnostics(error),
  };
}

function postWorkerError(error: unknown, requestId: unknown, capability: 'ticket' | 'pass', stage: 'calculation' | 'calculation_result_parse' = 'calculation') {
  const exception = error instanceof Error ? error : new Error(String(error));
  const message = normalizeCalculationError(exception.message);
  const details = {
    message,
    code: classifyCalculationError(message),
    source: 'worker',
    stage,
    exceptionName: exception.name,
    capability,
    retryable: false,
    retryCount: 0,
    workerRestartCount: 0,
    diagnostics: workerDiagnostics(error),
  };
  postMessage({ type: 'error', requestId, error: message, details });
}

async function initWasm() {
  if (wasmInstance) return;

  try {
    try {
      resourceDiagnostics.phase('bootstrap', 'runtime_import', 'started');
      await loadWasmRuntime();
      go = new Go();
      resourceDiagnostics.phase('bootstrap', 'runtime_import', 'completed');
    } catch (error) {
      postMessage(initFailure(error, 'worker_bootstrap', 0));
      return;
    }
    let wasmFetch;
    try {
      wasmFetch = await fetchAsset(WASM_URL, 'wasm_fetch');
    } catch (error) {
      postMessage(initFailure(error, 'wasm_fetch', Number((error as { retryCount?: number } | null)?.retryCount || 0)));
      return;
    }
    wasmRetryCount = wasmFetch.retryCount;
    const wasmArrayBuffer = wasmFetch.buffer;
    let result: WebAssembly.WebAssemblyInstantiatedSource;
    try {
      resourceDiagnostics.phase('wasm', 'wasm_instantiate', 'started');
      result = await WebAssembly.instantiate(wasmArrayBuffer, go.importObject);
      resourceDiagnostics.phase('wasm', 'wasm_instantiate', 'completed');
    } catch (error) {
      postMessage(initFailure(error, 'wasm_instantiate', wasmFetch.retryCount));
      return;
    }
    wasmInstance = result.instance;

    // Wasmメインの起動 (非同期だが同期的に登録される)
    go.run(wasmInstance);

    await Promise.all([initializeTicketGraph(), initializePassGraph()]);
  } catch (error) {
    console.error('Wasm/Graph initialization error:', error);
    postMessage(initFailure(error, 'worker_bootstrap', 0));
  }
}

async function initializeTicketGraph() {
  try {
    const fetched = await fetchAsset(TICKET_GRAPH_URL, 'ticket_graph_fetch');
    const buffer = fetched.buffer;
    resourceDiagnostics.phase('ticket', 'ticket_graph_initialize', 'started');
    const ptr = workerSelf.prepareTicketGraphBuffer(buffer.byteLength);
    const memory = new Uint8Array((wasmInstance!.exports.mem as WebAssembly.Memory).buffer);
    memory.set(new Uint8Array(buffer), ptr);
    const initialized = workerSelf.initTicketGraphFromBuffer(buffer.byteLength);
    if (initialized !== 'ok') throw new Error(`Ticket graph initialization failed: ${initialized}`);
    ticketGraphInitialized = true;
    resourceDiagnostics.phase('ticket', 'ticket_graph_initialize', 'completed');
    postMessage({ type: 'ready', capability: 'ticket', retryCount: wasmRetryCount + fetched.retryCount, initialError: firstAssetError('ticket'), diagnostics: workerDiagnostics() });
  } catch (error) {
    postMessage(initFailure(error, (error as { assetFetch?: boolean } | null)?.assetFetch ? 'ticket_graph_fetch' : 'ticket_graph_initialize', Number((error as { retryCount?: number } | null)?.retryCount || 0), 'ticket'));
  }
}

async function initializePassGraph() {
  try {
    const fetched = await fetchAsset(PASS_GRAPH_URL, 'pass_graph_fetch');
    const buffer = fetched.buffer;
    resourceDiagnostics.phase('pass', 'pass_graph_initialize', 'started');
    const ptr = workerSelf.preparePassGraphBuffer(buffer.byteLength);
    const memory = new Uint8Array((wasmInstance!.exports.mem as WebAssembly.Memory).buffer);
    memory.set(new Uint8Array(buffer), ptr);
    const initialized = workerSelf.initPassGraphFromBuffer(buffer.byteLength);
    if (initialized !== true) throw new Error(`Pass graph initialization failed: ${initialized}`);
    passGraphInitialized = true;
    resourceDiagnostics.phase('pass', 'pass_graph_initialize', 'completed');
    postMessage({ type: 'ready', capability: 'pass', retryCount: wasmRetryCount + fetched.retryCount, initialError: firstAssetError('pass'), diagnostics: workerDiagnostics() });
  } catch (error) {
    postMessage(initFailure(error, (error as { assetFetch?: boolean } | null)?.assetFetch ? 'pass_graph_fetch' : 'pass_graph_initialize', Number((error as { retryCount?: number } | null)?.retryCount || 0), 'pass'));
  }
}

// 起動時に初期化開始
postMessage({ type: 'initialization_progress', diagnostics: { ...workerDiagnostics(), workerBootstrapStage: 'engine_initialize' } });
initWasm();

onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'getRouteSplitCandidates') {
    const capability = payload.isPass ? 'pass' : 'ticket';
    try {
      if (payload.isPass ? !passGraphInitialized : !ticketGraphInitialized) throw new Error('計算エンジンが準備されていません');
      const args = JSON.stringify({ ...payload, candidatesOnly: true });
      const result = JSON.parse(payload.isPass ? workerSelf.calculateRouteSplitPass(args) : workerSelf.calculateRouteSplitTicket(args));
      if (result.error) throw new Error(result.error);
      postMessage({ type: 'success_route_split_candidates', requestId: payload.requestId, result });
    } catch (err) { postWorkerError(err, payload.requestId, capability); }
  } else if (type === 'calculateRoutePass' || type === 'calculateRouteSplitPass') {
    if (!passGraphInitialized) {
      postMessage({ type: 'error', requestId: payload?.requestId, error: 'Wasm graph not initialized yet' });
      return;
    }

    const { stationNames, months, isIc, calculationMode, requestId } = payload;
    try {
      const stationNamesJson = JSON.stringify(stationNames);
      const resultJsonStr = type === 'calculateRouteSplitPass'
        ? workerSelf.calculateRouteSplitPass(JSON.stringify({ stationNames, months, calculationMode: calculationMode || 'normal', maxSplits: payload.maxSplits, noSplitStations: payload.noSplitStations }), routeProgress(requestId))
        : workerSelf.calculateRoutePass(stationNamesJson, months, isIc, calculationMode || 'normal');
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        postWorkerError(result.error, payload?.requestId, 'pass');
        return;
      }
      postMessage({ type: type === 'calculateRouteSplitPass' ? 'success_route_split_pass' : 'success_route_pass', requestId, result });
    } catch (err) {
      postWorkerError(err, payload?.requestId, 'pass');
    }
  } else if (type === 'calculateRouteTicket' || type === 'calculateRouteSplitTicket') {
    if (!ticketGraphInitialized) {
      postMessage({ type: 'error', requestId: payload?.requestId, error: 'Wasm graph not initialized yet' });
      return;
    }

    const { fullPath, calculationMode, requestId } = payload;
    try {
      const reqJsonStr = JSON.stringify({
        fullPath,
        passengerType: payload.passengerType, discountId: payload.discountId,
        ...(type === "calculateRouteTicket" ? { departureSingleStation: payload.departureSingleStation, arrivalSingleStation: payload.arrivalSingleStation } : {}),
        maxSplits: payload.maxSplits, noSplitStations: payload.noSplitStations,
        calculationMode: calculationMode || "normal"
      });
      const resultJsonStr = type === 'calculateRouteSplitTicket'
        ? workerSelf.calculateRouteSplitTicket(reqJsonStr, routeProgress(requestId))
        : workerSelf.calculateRouteTicket(reqJsonStr);
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        postWorkerError(result.error, payload?.requestId, 'ticket');
        return;
      }
      postMessage({ type: type === 'calculateRouteSplitTicket' ? 'success_route_split_ticket' : 'success_route_ticket', requestId, result });
    } catch (err) {
      postWorkerError(err, payload?.requestId, 'ticket');
    }
  } else if (type === 'calculateOptimalSplitTicket') {
    const stream = createSplitResultStream(data => postMessage(data), payload?.requestId, 'ticket', 'auto');
    if (!ticketGraphInitialized) {
      postMessage({ type: 'error', requestId: payload?.requestId, error: 'Wasm graph not initialized yet' });
      return;
    }

    const { startStationName, endStationName, maxSplits, noSplitStations, requestId } = payload;
    try {
      const resultJsonStr = workerSelf.calculateOptimalSplitTicket(
        startStationName,
        endStationName,
        maxSplits,
        JSON.stringify(noSplitStations || []),
        stream.accept,
      );
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        stream.flush();
        postWorkerError(result.error, payload?.requestId, 'ticket');
        return;
      }
      stream.flush();
      postMessage({ type: 'success_calculate_optimal_split_ticket', requestId, result });
    } catch (err) {
      stream.flush();
      postWorkerError(err, payload?.requestId, 'ticket');
    }
  } else if (type === 'calculate' || type === 'calculateOptimalSplitPass') {
    const { months, isIc, isTicket, requestId } = payload;
    const stream = createSplitResultStream(data => postMessage(data), requestId, isTicket ? 'ticket' : 'pass', 'auto');
    const { splitPaths } = payload;
    if (isTicket ? !ticketGraphInitialized : !passGraphInitialized) {
      postMessage({ type: 'error', requestId: payload?.requestId, error: 'Wasm graph not initialized yet' });
      return;
    }

    try {
      if (type === 'calculateOptimalSplitPass') {
        const response = JSON.parse(workerSelf.calculateOptimalSplitPass(JSON.stringify({
          from: payload.startStationName, to: payload.endStationName, months, isIc,
          maxSplits: payload.maxSplits, noSplitStations: payload.noSplitStations,
        }), stream.accept));
        if (response.error) throw new Error(response.error);
      } else {
        for (const path of splitPaths) {
          const json = isTicket
            ? workerSelf.reconstructAndCalculateTicket(JSON.stringify(path), stream.accept)
            : workerSelf.reconstructAndCalculate(JSON.stringify(path), months, isIc, stream.accept);
          const response = JSON.parse(json);
          if (response.error) throw new Error(response.error);
        }
      }
      stream.flush();
      postMessage({ type: 'success', requestId, result: { streamed: true } });
    } catch (err) {
      stream.flush();
      postWorkerError(err, payload?.requestId, isTicket ? 'ticket' : 'pass');
    }
  }
};
