/// <reference lib="webworker" />

// Go Wasm ローダーの読み込み
importScripts('/wasm_exec.js');

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

async function initWasm() {
  if (wasmInstance) return;

  try {
    const wasmResponse = await fetch('/split_pass.wasm');
    const wasmArrayBuffer = await wasmResponse.arrayBuffer();
    const result = await WebAssembly.instantiate(wasmArrayBuffer, go.importObject);
    wasmInstance = result.instance;

    // Wasmメインの起動 (非同期だが同期的に登録される)
    go.run(wasmInstance);

    // グラフデータのロード (真のゼロコピー)
    const graphResponse = await fetch('/graph_data.bin');
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
    postMessage({ type: 'error', error: String(error) });
  }
}

// 起動時に初期化開始
initWasm();

onmessage = async (e: MessageEvent) => {
  const { type, payload } = e.data;

  if (type === 'calculate') {
    if (!graphInitialized) {
      postMessage({ type: 'error', error: 'Wasm graph not initialized yet' });
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

      postMessage({ type: 'success', result: { normal: normalResult, results: uniqueResults } });
    } catch (err) {
      postMessage({ type: 'error', error: String(err) });
    }
  }
};
