import { performance } from "perf_hooks";
import { calcSplit } from "@/app/split/lib/calcSplit";

const START_STATION = "東京";
const END_STATION = "大宮";
const WARMUP_COUNT = 20;
const MEASURE_COUNT = 100;

function runBenchmark() {
    console.log(`ベンチマークを開始します...`);
    console.log(`区間: ${START_STATION} -> ${END_STATION}`);
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

    console.log(`\n[2/2] 計測を実行中 (${MEASURE_COUNT}回)...`);
    const times: number[] = [];

    for (let i = 0; i < MEASURE_COUNT; i++) {
        const startTime = performance.now();

        calcSplit.findOptimalSplitByShortestGiseiKiloPath(START_STATION, END_STATION);

        const endTime = performance.now();
        times.push(endTime - startTime);
    }

    // 3. 統計結果の算出
    // パーセンタイルを計算するために昇順にソート
    times.sort((a, b) => a - b);

    const totalTime = times.reduce((sum, t) => sum + t, 0);
    const mean = totalTime / times.length;

    const p50Index = Math.floor(times.length * 0.50);
    const p95Index = Math.floor(times.length * 0.95);
    const p99Index = Math.floor(times.length * 0.99);

    const min = times[0];
    const p50 = times[p50Index]; // 中央値
    const p95 = times[p95Index];
    const p99 = times[p99Index]; // 最悪値の指標
    const max = times[times.length - 1];

    // 結果の出力
    console.log(`\n=== ベンチマーク結果 ===`);
    console.log(`実行回数: ${MEASURE_COUNT}回`);
    console.log(`最小値 (Min):  ${min.toFixed(3)} ms`);
    console.log(`中央値 (p50):  ${p50.toFixed(3)} ms`);
    console.log(`平均値 (Mean): ${mean.toFixed(3)} ms`);
    console.log(`上位95% (p95): ${p95.toFixed(3)} ms`);
    console.log(`最悪値 (p99):  ${p99.toFixed(3)} ms  <-- SREが最も注視する指標`);
    console.log(`最大値 (Max):  ${max.toFixed(3)} ms`);
    console.log(`========================`);
}

// 実行
runBenchmark();
