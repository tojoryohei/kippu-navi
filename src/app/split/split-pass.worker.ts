/// <reference lib="webworker" />

interface GoInstance {
  importObject: WebAssembly.Imports;
  run(instance: WebAssembly.Instance): Promise<void>;
}

declare const Go: {
  new (): GoInstance;
};

interface WorkerGlobalScope {
  prepareGraphBuffer(size: number): number;
  initGraphFromBuffer(size: number): boolean | string;
  reconstructAndCalculate(splitStationsJson: string, months: number, isIc: boolean): string;
  calculateRoutePass(stationNamesJson: string, months: number, isIc: boolean, calculationMode: string): string;
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

let go: GoInstance;
let wasmInstance: WebAssembly.Instance | null = null;
let graphInitialized = false;

async function initWasm(origin: string) {
  if (wasmInstance) return;

  try {
    // メインスレッドから送られた origin をもとに wasm_exec.js を読み込む
    importScripts(`${origin}/engine/wasm_exec.js`);
    go = new Go();

    const wasmResponse = await fetch(`${origin}/engine/split_pass.wasm`);
    const wasmArrayBuffer = await wasmResponse.arrayBuffer();
    const result = await WebAssembly.instantiate(wasmArrayBuffer, go.importObject);
    wasmInstance = result.instance;

    // Wasmメインの起動 (非同期だが同期的に登録される)
    go.run(wasmInstance);

    // グラフデータのロード (真のゼロコピー)
    const graphResponse = await fetch(`${origin}/engine/graph_data.bin`);
    const graphArrayBuffer = await graphResponse.arrayBuffer();
    const size = graphArrayBuffer.byteLength;

    // Go側にメモリ確保を依頼し、そのポインタ (オフセット) を取得
    const ptr = workerSelf.prepareGraphBuffer(size);

    // Wasmのリニアメモリに直接書き込み (Zero-copy Memory Offset Injection)
    const wasmMem = (wasmInstance.exports.mem || (go.importObject.env && go.importObject.env.memory)) as WebAssembly.Memory;
    const wasmMemory = new Uint8Array(wasmMem.buffer);
    wasmMemory.set(new Uint8Array(graphArrayBuffer), ptr);

    // Go側の初期化関数を実行
    const initResult = workerSelf.initGraphFromBuffer(size);
    if (initResult !== true) {
      throw new Error(`Graph initialization failed: ${initResult}`);
    }

    graphInitialized = true;
    postMessage({ type: 'ready' });
  } catch (error) {
    console.error('Wasm/Graph initialization error:', error);
    postMessage({
      type: 'error',
      error: {
        code: 'WASM_INIT_FAILED',
        message: String(error)
      }
    });
  }
}

onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'init') {
    const { origin } = payload;
    await initWasm(origin);
  } else if (type === 'calculateRoutePass') {
    if (!graphInitialized) {
      postMessage({
        type: 'error',
        error: {
          code: 'NOT_INITIALIZED',
          message: 'Wasm graph not initialized yet'
        }
      });
      return;
    }

    const { stationNames, months, isIc, calculationMode } = payload;
    try {
      const stationNamesJson = JSON.stringify(stationNames);
      const resultJsonStr = workerSelf.calculateRoutePass(stationNamesJson, months, isIc, calculationMode || 'normal');
      const result = JSON.parse(resultJsonStr);
      if (result.error) {
        postMessage({
          type: 'error',
          error: {
            code: 'CALCULATION_FAILED',
            message: result.error
          }
        });
        return;
      }
      postMessage({ type: 'success_route_pass', result });
    } catch (err) {
      postMessage({
        type: 'error',
        error: {
          code: 'CALCULATION_UNCAUGHT_FAILED',
          message: String(err)
        }
      });
    }
  } else if (type === 'calculate') {
    if (!graphInitialized) {
      postMessage({
        type: 'error',
        error: {
          code: 'NOT_INITIALIZED',
          message: 'Wasm graph not initialized yet'
        }
      });
      return;
    }

    const { splitPaths, months, isIc } = payload;
    try {
      const combinedResults: WasmResultResponse[] = [];
      let normalResult: WasmResultResponse | null = null;

      for (const path of splitPaths) {
        // splitStations は JSON 文字列として Go に渡す
        const splitStationsJson = JSON.stringify(path);
        const resultJsonStr = workerSelf.reconstructAndCalculate(splitStationsJson, months, isIc);

        const result = JSON.parse(resultJsonStr);
        if (result.error) {
          postMessage({
            type: 'error',
            error: {
              code: 'CALCULATION_FAILED',
              message: result.error
            }
          });
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

      postMessage({ type: 'success', result: { normal: normalResult, results: uniqueResults } });
    } catch (err) {
      postMessage({
        type: 'error',
        error: {
          code: 'CALCULATION_UNCAUGHT_FAILED',
          message: String(err)
        }
      });
    }
  }
};
