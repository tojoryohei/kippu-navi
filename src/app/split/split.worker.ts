/// <reference lib="webworker" />

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
const WASM_VERSION = "20260902-6";
importScripts(`${baseOrigin}/engine/wasm_exec.js?v=${WASM_VERSION}`);

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
  calculateOptimalSplitTicket(startStationName: string, endStationName: string): string;
}
const workerSelf = (typeof self !== 'undefined' ? self : globalThis) as unknown as WorkerGlobalScope;

interface WasmSegment {
  start: string;
  end: string;
  path: string[];
  via: string[];
  totalEigyoKilo?: number;
  result?: {
    Fare: number;
    BarrierFreeFee: number;
    Charge: number;
  };
}

interface WasmResultResponse {
  totalAmount: number;
  segments: WasmSegment[];
}

const go = new Go();
let wasmInstance: WebAssembly.Instance | null = null;
let graphInitialized = false;

const WASM_URL = `${baseOrigin}/engine/main.wasm?v=${WASM_VERSION}`;
const PASS_GRAPH_URL = `${baseOrigin}/engine/pass_graph_data.bin?v=${WASM_VERSION}`;
const TICKET_GRAPH_URL = `${baseOrigin}/engine/ticket_graph_data.bin?v=${WASM_VERSION}`;

async function initWasm() {
  if (wasmInstance) return;

  try {
    const wasmResponse = await fetch(WASM_URL);
    if (!wasmResponse.ok) {
      throw new Error(`WASM binary fetch failed from ${WASM_URL}: ${wasmResponse.status} ${wasmResponse.statusText}`);
    }
    const wasmArrayBuffer = await wasmResponse.arrayBuffer();
    const result = await WebAssembly.instantiate(wasmArrayBuffer, go.importObject);
    wasmInstance = result.instance;

    // Wasmメインの起動 (非同期だが同期的に登録される)
    go.run(wasmInstance);

    // グラフデータのロード (真のゼロコピー)
    // 1. 定期券グラフのロード
    const passGraphResponse = await fetch(PASS_GRAPH_URL);
    if (!passGraphResponse.ok) {
      throw new Error(`Pass graph data fetch failed from ${PASS_GRAPH_URL}: ${passGraphResponse.status} ${passGraphResponse.statusText}`);
    }
    const passGraphArrayBuffer = await passGraphResponse.arrayBuffer();
    const passSize = passGraphArrayBuffer.byteLength;

    const passPtr = workerSelf.preparePassGraphBuffer(passSize);
    const wasmMem = (wasmInstance.exports.mem || (go.importObject.env && go.importObject.env.memory)) as WebAssembly.Memory;
    const wasmMemory = new Uint8Array(wasmMem.buffer);
    wasmMemory.set(new Uint8Array(passGraphArrayBuffer), passPtr);

    const initPassResult = workerSelf.initPassGraphFromBuffer(passSize);
    if (initPassResult !== true) {
      throw new Error(`Pass graph initialization failed: ${initPassResult}`);
    }

    // 2. 乗車券グラフのロード
    const ticketGraphResponse = await fetch(TICKET_GRAPH_URL);
    if (!ticketGraphResponse.ok) {
      throw new Error(`Ticket graph data fetch failed from ${TICKET_GRAPH_URL}: ${ticketGraphResponse.status} ${ticketGraphResponse.statusText}`);
    }
    const ticketGraphArrayBuffer = await ticketGraphResponse.arrayBuffer();
    const ticketSize = ticketGraphArrayBuffer.byteLength;

    const ticketPtr = workerSelf.prepareTicketGraphBuffer(ticketSize);
    // wasmMemory は再取得（メモリが拡張された可能性を考慮）
    const wasmMemory2 = new Uint8Array(((wasmInstance.exports.mem || (go.importObject.env && go.importObject.env.memory)) as WebAssembly.Memory).buffer);
    wasmMemory2.set(new Uint8Array(ticketGraphArrayBuffer), ticketPtr);

    const initTicketResult = workerSelf.initTicketGraphFromBuffer(ticketSize);
    if (initTicketResult !== "ok") {
      throw new Error(`Ticket graph initialization failed: ${initTicketResult}`);
    }

    graphInitialized = true;
    postMessage({ type: 'ready' });
  } catch (error) {
    console.error('Wasm/Graph initialization error:', error);
    postMessage({ type: 'error', error: String(error) });
  }
}

// 起動時に初期化開始
initWasm();

onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'calculateRoutePass') {
    if (!graphInitialized) {
      postMessage({ type: 'error', error: 'Wasm graph not initialized yet' });
      return;
    }

    const { stationNames, months, isIc, calculationMode, requestId } = payload;
    try {
      const stationNamesJson = JSON.stringify(stationNames);
      const resultJsonStr = workerSelf.calculateRoutePass(stationNamesJson, months, isIc, calculationMode || 'normal');
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        postMessage({ type: 'error', error: result.error });
        return;
      }
      postMessage({ type: 'success_route_pass', requestId, result });
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
    }
  } else if (type === 'calculateRouteTicket') {
    if (!graphInitialized) {
      postMessage({ type: 'error', error: 'Wasm graph not initialized yet' });
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
        postMessage({ type: 'error', error: result.error });
        return;
      }
      postMessage({ type: 'success_route_ticket', requestId, result });
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
    }
  } else if (type === 'calculateOptimalSplitTicket') {
    if (!graphInitialized) {
      postMessage({ type: 'error', error: 'Wasm graph not initialized yet' });
      return;
    }

    const { startStationName, endStationName, requestId } = payload;
    try {
      const resultJsonStr = workerSelf.calculateOptimalSplitTicket(startStationName, endStationName);
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        postMessage({ type: 'error', error: result.error });
        return;
      }
      postMessage({ type: 'success_calculate_optimal_split_ticket', requestId, result });
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
    }
  } else if (type === 'calculate') {
    if (!graphInitialized) {
      postMessage({ type: 'error', error: 'Wasm graph not initialized yet' });
      return;
    }

    const { splitPaths, months, isIc, isTicket, requestId } = payload;
    try {
      const combinedResults: WasmResultResponse[] = [];
      let normalResult: WasmResultResponse | null = null;

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
          postMessage({ type: 'error', error: result.error });
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
      const uniqueResults: WasmResultResponse[] = [];

      for (const res of combinedResults) {
        const pathKey = res.segments.map((seg: WasmSegment) => `${seg.start}-${seg.end}:${seg.path.join(',')}`).join('|');
        if (!seenPaths.has(pathKey)) {
          seenPaths.add(pathKey);
          uniqueResults.push(res);
        }
      }

      uniqueResults.sort((a, b) => a.totalAmount - b.totalAmount);

      postMessage({ type: 'success', requestId, result: { normal: normalResult, results: uniqueResults } });
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
    }
  }
};
