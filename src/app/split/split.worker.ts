/// <reference lib="webworker" />
import * as Sentry from "@sentry/browser";
import { classifyCalculationError } from "@/lib/search-errors";
interface SplitCalculationSegment {
  start: string;
  end: string;
  path: string[];
  via: string[];
  totalEigyoKilo: number;
  result?: {
    Fare: number;
    BarrierFreeFee: number;
    Charge?: number;
  };
}

interface SplitCalculationResult {
  totalAmount: number;
  segments: SplitCalculationSegment[];
}

interface SplitCalculationResponse {
  normal: SplitCalculationResult | null;
  results: SplitCalculationResult[];
}

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
const sentryDsn = import.meta.env.PUBLIC_SENTRY_DSN;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    tunnel: `${baseOrigin}/monitoring`,
    environment: __DEPLOY_ENVIRONMENT__,
    release: `${__APP_VERSION__}+${__DEPLOY_COMMIT__}`,
    sendDefaultPii: false,
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
let currentEngineBaseUrl: string | null | undefined;
let currentEngineBaseUrlPromise: Promise<string | null> | undefined;

async function getCurrentEngineBaseUrl() {
  if (currentEngineBaseUrl !== undefined) return currentEngineBaseUrl;
  if (currentEngineBaseUrlPromise) return currentEngineBaseUrlPromise;

  const origin = baseOrigin || (self.location.origin !== 'null' ? self.location.origin : '');
  if (!origin) {
    currentEngineBaseUrl = null;
    return currentEngineBaseUrl;
  }

  currentEngineBaseUrlPromise = fetch(`${origin}/deployment.json`, { cache: 'no-store' })
    .then(async response => {
      if (!response.ok) return null;
      const deployment = await response.json() as { enginePath?: unknown };
      if (typeof deployment.enginePath !== 'string') return null;

      const engineUrl = new URL(deployment.enginePath, `${origin}/deployment.json`);
      if (engineUrl.origin !== origin || !/^\/engine\/[a-f0-9]{64}$/.test(engineUrl.pathname)) return null;

      return engineUrl.href.replace(/\/$/, '');
    })
    .catch(() => null);

  currentEngineBaseUrl = await currentEngineBaseUrlPromise;
  currentEngineBaseUrlPromise = undefined;
  return currentEngineBaseUrl;
}

interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

declare const Go: {
  new(): GoInstance;
};

interface WorkerGlobalScope {
  preparePassGraphBuffer(size: number): number;
  initPassGraphFromBuffer(size: number): boolean | string;
  prepareTicketGraphBuffer(size: number): number;
  initTicketGraphFromBuffer(size: number): boolean | string;
  reconstructAndCalculate(splitStationsJson: string, months: number, isIc: boolean): string;
  reconstructAndCalculateTicket(splitStationsJson: string): string;
  calculateRoutePass(stationNamesJson: string, months: number, isIc: boolean, calculationMode: string): string;
  calculateRouteTicket(jsonStr: string): string;
  calculateOptimalSplitTicket(startStationName: string, endStationName: string, maxSplits?: number, noSplitStationsJson?: string): string;
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
const ASSET_REQUEST_TIMEOUT_MS = 8_000;

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
}

const RETRY_DELAYS_MS = [150, 500];

function isRetryableStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

async function loadWasmRuntime() {
  const runtimeUrl = `${engineBaseUrl}/wasm_exec.js`;
  try {
    await import(/* @vite-ignore */ runtimeUrl);
    return;
  } catch (error) {
    const currentBaseUrl = await getCurrentEngineBaseUrl();
    const fallbackUrl = currentBaseUrl ? `${currentBaseUrl}/wasm_exec.js` : null;
    if (!fallbackUrl || fallbackUrl === runtimeUrl) throw error;
    await import(/* @vite-ignore */ fallbackUrl);
  }
}

async function fetchAssetWithRetry(url: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ASSET_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (response.ok) return { response, retryCount: attempt };
      const error = new Error(`${url}: ${response.status} ${response.statusText}`);
      Object.assign(error, { httpStatus: response.status, retryCount: attempt });
      if (!isRetryableStatus(response.status) || attempt === RETRY_DELAYS_MS.length) throw error;
      lastError = error;
    } catch (error) {
      lastError = error;
      const status = (error as { httpStatus?: number }).httpStatus;
      if ((status !== undefined && !isRetryableStatus(status)) || attempt === RETRY_DELAYS_MS.length) {
        if (error && typeof error === 'object') Object.assign(error, { retryCount: attempt, assetFetch: true });
        throw error;
      }
    } finally {
      clearTimeout(timeout);
    }
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
  }
  throw lastError;
}

async function fetchAsset(url: string) {
  try {
    return await fetchAssetWithRetry(url);
  } catch (error) {
    const status = (error as { httpStatus?: number }).httpStatus;
    const assetMatch = url.match(/\/engine\/[a-f0-9]{64}\/([^/?#]+)$/);
    if ((status !== 403 && status !== 404) || !assetMatch) throw error;

    const currentBaseUrl = await getCurrentEngineBaseUrl();
    if (!currentBaseUrl) throw error;

    const fallbackUrl = `${currentBaseUrl}/${assetMatch[1]}`;
    if (fallbackUrl === url) throw error;

    try {
      // A stale HTML/Worker bundle can retain an engine hash from a previous
      // deployment. Use the current deployment manifest when that version was
      // removed from the active static-assets manifest.
      const fallback = await fetchAssetWithRetry(fallbackUrl);
      return { ...fallback, retryCount: fallback.retryCount + 1 };
    } catch (fallbackError) {
      if (fallbackError && typeof fallbackError === 'object') {
        Object.assign(fallbackError, { originalUrl: url, fallbackUrl });
      }
      throw fallbackError;
    }
  }
}

function initFailure(error: unknown, stage: InitStage, retryCount: number, capability?: 'ticket' | 'pass'): InitFailure {
  const exception = error instanceof Error ? error : new Error(String(error));
  const httpStatus = (error as { httpStatus?: number }).httpStatus;
  return {
    type: 'initialization_error',
    error: exception.message,
    errorCode: stage.endsWith('_fetch') ? 'engine_asset_fetch_failed'
      : stage === 'wasm_instantiate' ? 'wasm_instantiation_failed'
        : stage.endsWith('_initialize') ? 'graph_initialization_failed'
          : 'engine_initialization_failed',
    errorStage: stage,
    exceptionName: exception.name,
    httpStatus,
    capability,
    retryable: httpStatus === undefined || isRetryableStatus(httpStatus),
    retryCount,
  };
}

function postWorkerError(error: unknown, requestId: unknown, capability: 'ticket' | 'pass', stage: 'calculation' | 'calculation_result_parse' = 'calculation') {
  const exception = error instanceof Error ? error : new Error(String(error));
  const details = {
    message: exception.message,
    code: classifyCalculationError(exception.message),
    source: 'worker',
    stage,
    exceptionName: exception.name,
    capability,
    retryable: false,
    retryCount: 0,
    workerRestartCount: 0,
  };
  postMessage({ type: 'error', requestId, error: exception.message, details });
}

async function initWasm() {
  if (wasmInstance) return;

  try {
    try {
      await loadWasmRuntime();
      go = new Go();
    } catch (error) {
      postMessage(initFailure(error, 'worker_bootstrap', 0));
      return;
    }
    let wasmFetch;
    try {
      wasmFetch = await fetchAsset(WASM_URL);
    } catch (error) {
      postMessage(initFailure(error, 'wasm_fetch', Number((error as { retryCount?: number }).retryCount || 0)));
      return;
    }
    const wasmResponse = wasmFetch.response;
    wasmRetryCount = wasmFetch.retryCount;
    const wasmArrayBuffer = await wasmResponse.arrayBuffer();
    let result: WebAssembly.WebAssemblyInstantiatedSource;
    try {
      result = await WebAssembly.instantiate(wasmArrayBuffer, go.importObject);
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
    const fetched = await fetchAsset(TICKET_GRAPH_URL);
    const buffer = await fetched.response.arrayBuffer();
    const ptr = workerSelf.prepareTicketGraphBuffer(buffer.byteLength);
    const memory = new Uint8Array((wasmInstance!.exports.mem as WebAssembly.Memory).buffer);
    memory.set(new Uint8Array(buffer), ptr);
    const initialized = workerSelf.initTicketGraphFromBuffer(buffer.byteLength);
    if (initialized !== 'ok') throw new Error(`Ticket graph initialization failed: ${initialized}`);
    ticketGraphInitialized = true;
    postMessage({ type: 'ready', capability: 'ticket', retryCount: wasmRetryCount + fetched.retryCount });
  } catch (error) {
    postMessage(initFailure(error, (error as { assetFetch?: boolean }).assetFetch ? 'ticket_graph_fetch' : 'ticket_graph_initialize', Number((error as { retryCount?: number }).retryCount || 0), 'ticket'));
  }
}

async function initializePassGraph() {
  try {
    const fetched = await fetchAsset(PASS_GRAPH_URL);
    const buffer = await fetched.response.arrayBuffer();
    const ptr = workerSelf.preparePassGraphBuffer(buffer.byteLength);
    const memory = new Uint8Array((wasmInstance!.exports.mem as WebAssembly.Memory).buffer);
    memory.set(new Uint8Array(buffer), ptr);
    const initialized = workerSelf.initPassGraphFromBuffer(buffer.byteLength);
    if (initialized !== true) throw new Error(`Pass graph initialization failed: ${initialized}`);
    passGraphInitialized = true;
    postMessage({ type: 'ready', capability: 'pass', retryCount: wasmRetryCount + fetched.retryCount });
  } catch (error) {
    postMessage(initFailure(error, (error as { assetFetch?: boolean }).assetFetch ? 'pass_graph_fetch' : 'pass_graph_initialize', Number((error as { retryCount?: number }).retryCount || 0), 'pass'));
  }
}

// 起動時に初期化開始
initWasm();

onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'calculateRoutePass') {
    if (!passGraphInitialized) {
      postMessage({ type: 'error', requestId: payload?.requestId, error: 'Wasm graph not initialized yet' });
      return;
    }

    const { stationNames, months, isIc, calculationMode, requestId } = payload;
    try {
      const stationNamesJson = JSON.stringify(stationNames);
      const resultJsonStr = workerSelf.calculateRoutePass(stationNamesJson, months, isIc, calculationMode || 'normal');
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        postWorkerError(result.error, payload?.requestId, 'pass');
        return;
      }
      postMessage({ type: 'success_route_pass', requestId, result });
    } catch (err) {
      postWorkerError(err, payload?.requestId, 'pass');
    }
  } else if (type === 'calculateRouteTicket') {
    if (!ticketGraphInitialized) {
      postMessage({ type: 'error', requestId: payload?.requestId, error: 'Wasm graph not initialized yet' });
      return;
    }

    const { fullPath, calculationMode, requestId } = payload;
    try {
      const reqJsonStr = JSON.stringify({
        fullPath: fullPath.map((stationName: string) => ({ stationName, lineName: null })),
        calculationMode: calculationMode || "normal"
      });
      const resultJsonStr = workerSelf.calculateRouteTicket(reqJsonStr);
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        postWorkerError(result.error, payload?.requestId, 'ticket');
        return;
      }
      postMessage({ type: 'success_route_ticket', requestId, result });
    } catch (err) {
      postWorkerError(err, payload?.requestId, 'ticket');
    }
  } else if (type === 'calculateOptimalSplitTicket') {
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
      );
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        postWorkerError(result.error, payload?.requestId, 'ticket');
        return;
      }
      postMessage({ type: 'success_calculate_optimal_split_ticket', requestId, result });
    } catch (err) {
      postWorkerError(err, payload?.requestId, 'ticket');
    }
  } else if (type === 'calculate') {
    const { splitPaths, months, isIc, isTicket, requestId } = payload;
    if (isTicket ? !ticketGraphInitialized : !passGraphInitialized) {
      postMessage({ type: 'error', requestId: payload?.requestId, error: 'Wasm graph not initialized yet' });
      return;
    }

    try {
      const combinedResults: SplitCalculationResult[] = [];
      let normalResult: SplitCalculationResult | null = null;

      for (const path of splitPaths) {
        // splitStations は JSON 文字列として Go に渡す
        const splitStationsJson = JSON.stringify(path);
        let resultJsonStr = "";

        if (isTicket) {
          resultJsonStr = workerSelf.reconstructAndCalculateTicket(splitStationsJson);
        } else {
          resultJsonStr = workerSelf.reconstructAndCalculate(splitStationsJson, months, isIc);
        }

        const result = JSON.parse(resultJsonStr);
        if (result.error) {
          postWorkerError(result.error, payload?.requestId, isTicket ? 'ticket' : 'pass');
          return;
        }

        if (!normalResult) {
          normalResult = result.normal;
        }

        if (result.results) {
          combinedResults.push(...result.results);
        }
      }

      // 重複する経路（同一 segments）がある場合は排除しつつ、最安順にソート
      const seenPaths = new Set<string>();
      const uniqueResults: SplitCalculationResult[] = [];

      for (const res of combinedResults) {
        const pathKey = res.segments.map((seg: SplitCalculationSegment) => `${seg.start}-${seg.end}:${seg.path.join(',')}`).join('|');
        if (!seenPaths.has(pathKey)) {
          seenPaths.add(pathKey);
          uniqueResults.push(res);
        }
      }

      uniqueResults.sort((a, b) => a.totalAmount - b.totalAmount);

      const response: SplitCalculationResponse = {
        normal: normalResult,
        results: uniqueResults,
      };
      postMessage({ type: 'success', requestId, result: response });
    } catch (err) {
      postWorkerError(err, payload?.requestId, isTicket ? 'ticket' : 'pass');
    }
  }
};
