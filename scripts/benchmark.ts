import { performance } from "perf_hooks";
import { calcSplit } from "@/app/split/lib/calcSplit";

const START_STATION = "東京";
const END_STATION = "大宮";
const WARMUP_COUNT = 2000;  // 変更: TurboFanによるJIT最適化を完全に発火させる
const MEASURE_COUNT = 1000; // 変更: p99の統計的有意性を確保する

function runBenchmark() {
    console.log(`ベンチマークを開始します...`);
    console.log(`区間: ${START_STATION} -> ${END_STATION}`);

    // --- 1. JIT ウォームアップ ---
    console.log(`\n[1/2] ウォームアップを実行中 (${WARMUP_COUNT}回)...`);
    for (let i = 0; i < WARMUP_COUNT; i++) {
        try {
            calcSplit.findOptimalSplitByShortestGiseiKiloPath(START_STATION, END_STATION);
        } catch (e) {
            console.error("ウォームアップ中にエラーが発生しました:", e);
            return;
        }
    }
    console.log(`ウォームアップ完了。`);

    // --- 2. GC（ガベージコレクション）の強制実行 ---
    // ウォームアップで発生したゴミによるGCポーズが計測データに混入するのを防ぐ
    if (typeof global.gc === 'function') {
        console.log(`強制GCを実行し、ヒープメモリをクリーンアップします...`);
        global.gc();
    } else {
        console.warn(`[警告] --expose-gc フラグがありません。計測値にGCポーズのノイズが混入します。`);
    }

    // --- 3. 本番計測 ---
    console.log(`\n[2/2] 計測を実行中 (${MEASURE_COUNT}回)...`);
    const times = new Float64Array(MEASURE_COUNT);

    for (let i = 0; i < MEASURE_COUNT; i++) {
        const startTime = performance.now();
        calcSplit.findOptimalSplitByShortestGiseiKiloPath(START_STATION, END_STATION);
        const endTime = performance.now();
        times[i] = endTime - startTime;
    }

    // --- 4. 統計結果の算出 ---
    times.sort();

    const totalTime = times.reduce((sum, t) => sum + t, 0);
    const mean = totalTime / times.length;

    const min = times[0];
    const p50 = times[Math.floor(times.length * 0.50)];
    const p90 = times[Math.floor(times.length * 0.90)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const p99 = times[Math.floor(times.length * 0.99)];
    const max = times[times.length - 1];

    // 結果の出力
    console.log(`\n=== ベンチマーク結果 ===`);
    console.log(`実行回数: ${MEASURE_COUNT}回`);
    console.log(`最小値 (Min):  ${min.toFixed(3)} ms`);
    console.log(`中央値 (p50):  ${p50.toFixed(3)} ms`);
    console.log(`平均値 (Mean): ${mean.toFixed(3)} ms`);
    console.log(`上位90% (p90): ${p90.toFixed(3)} ms`);
    console.log(`上位95% (p95): ${p95.toFixed(3)} ms`);
    console.log(`最悪値 (p99):  ${p99.toFixed(3)} ms  <-- SRE注視指標`);
    console.log(`最大値 (Max):  ${max.toFixed(3)} ms`);
    console.log(`========================`);
}

// 実行
runBenchmark();
