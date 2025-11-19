import { loadSplit } from '@/app/split/lib/loadSplit';
import { calculateFareFromPath, calculateBarrierFreeFeeFromPath } from '@/components/calcFare';
import { correctPath } from '@/components/correctPath';
import { generatePrintedViaStrings } from '@/app/utils/calc';
import { PathStep, SplitSegment, SplitApiResponse } from '@/app/types';

/**
 * 優先度付きキュー (修正版)
 * 経路(path)は保存せず、駅名とコストのみを管理する
 */
class PriorityQueue {

    private heap: { stationName: string; cost: number }[] = []; // path を削除

    isEmpty(): boolean {
        return this.heap.length === 0;
    }

    /**
     * 項目をキューに追加 (O(log N))
     */
    enqueue(stationName: string, cost: number): void { // path を削除
        this.heap.push({ stationName, cost });
        this.bubbleUp(this.heap.length - 1);
    }

    /**
     * 最小コストの項目をキューから取り出す (O(log N))
     */
    dequeue(): { stationName: string; cost: number } | null { // path を削除
        if (this.isEmpty()) return null;
        if (this.heap.length === 1) return this.heap.pop()!;

        const root = this.heap[0];
        this.heap[0] = this.heap.pop()!;
        this.bubbleDown(0);
        return root;
    }

    /**
     * ヒープ構造を維持するため、追加した要素を上に移動させる
     */
    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[index].cost < this.heap[parentIndex].cost) {
                [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
                index = parentIndex;
            } else {
                break;
            }
        }
    }

    /**
     * ヒープ構造を維持するため、根に移動した要素を下に移動させる
     */
    private bubbleDown(index: number): void {
        const lastIndex = this.heap.length - 1;
        while (true) {
            let leftChildIndex = 2 * index + 1;
            let rightChildIndex = 2 * index + 2;
            let smallestIndex = index;

            if (leftChildIndex <= lastIndex && this.heap[leftChildIndex].cost < this.heap[smallestIndex].cost) {
                smallestIndex = leftChildIndex;
            }
            if (rightChildIndex <= lastIndex && this.heap[rightChildIndex].cost < this.heap[smallestIndex].cost) {
                smallestIndex = rightChildIndex;
            }

            if (smallestIndex !== index) {
                [this.heap[index], this.heap[smallestIndex]] = [this.heap[smallestIndex], this.heap[index]];
                index = smallestIndex;
            } else {
                break;
            }
        }
    }
}

class CalculatorSplit {

    // 運賃計算のメモ化用マップ (通し運賃)
    private fareMemo: Map<string, number> = new Map();
    // 分割計算のメモ化用マップ
    private splitMemo: Map<string, SplitApiResponse | null> = new Map();


    /**
     * メイン関数：
     * 擬制キロ最短経路を1本見つけ、その経路の最適分割を計算する
     * (旧: findCheapestRoute)
     */
    public findOptimalSplitByShortestGiseiKiloPath(startStationName: string, endStationName: string): SplitApiResponse | null {

        // メモをリセット
        this.fareMemo.clear();
        this.splitMemo.clear();

        // --- ステップ1: 擬制キロが最短の経路を1本見つける (Dijkstra) ---

        // ★修正点: 探索結果（previousマップ）を受け取る
        const { pathFound, previous } = this.findShortestPathByGiseiKilo(startStationName, endStationName);

        if (!pathFound) {
            return null; // 経路が見つからなかった
        }

        // ★追加点: previousマップから経路を復元
        const shortestPath = this.reconstructPath(previous, startStationName, endStationName);

        if (!shortestPath) {
            return null; // 経路復元に失敗
        }

        // --- ステップ2: 見つかった1本の経路に対して、最適分割（DP）を実行 ---
        return this.calculateOptimalSplitForPath(shortestPath);
    }

    /**
     * ステップ1: 擬制キロをコストとして使い、最短経路をDijkstraで探索 (修正版)
     */
    private findShortestPathByGiseiKilo(
        startStationName: string,
        endStationName: string
    ): { pathFound: boolean; previous: Map<string, { parentStation: string; lineName: string | null; }> } {

        // 始点から各駅までの最短「擬制キロ」
        const costs: Map<string, number> = new Map();

        // ★修正点: 経路復元のためのpreviousマップ
        // key: 子駅, value: { 親駅, 経由した路線名 }
        const previous: Map<string, { parentStation: string; lineName: string | null; }> = new Map();

        const pq = new PriorityQueue();

        costs.set(startStationName, 0);
        pq.enqueue(startStationName, 0); // ★修正点: pathを渡さない

        while (!pq.isEmpty()) {
            const { stationName: currentStation, cost: currentCost } = pq.dequeue()!;

            if (currentCost > (costs.get(currentStation) || Infinity)) {
                continue;
            }

            // ★ 目的地に到達したら、探索終了
            if (currentStation === endStationName) {
                return { pathFound: true, previous }; // ★修正点: previousマップを返す
            }

            const neighbors = loadSplit.getNeighbors(currentStation);

            for (const neighborStation of neighbors) {

                // ★修正点: 循環経路の禁止 (previousを辿ってチェック)
                let isLoop = false;
                let checkStation = currentStation;
                while (previous.has(checkStation)) {
                    const parent = previous.get(checkStation)!.parentStation;
                    if (parent === neighborStation) {
                        isLoop = true;
                        break;
                    }
                    checkStation = parent;
                }
                if (isLoop) {
                    continue;
                }


                const segments = loadSplit.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;

                const representativeSegment = segments[0];
                const weight = representativeSegment.giseiKilo;
                const newCost = currentCost + weight;

                if (!costs.has(neighborStation) || newCost < (costs.get(neighborStation) || Infinity)) {
                    costs.set(neighborStation, newCost);

                    // ★修正点: previousマップに親情報を記録
                    previous.set(neighborStation, {
                        parentStation: currentStation,
                        lineName: representativeSegment.line
                    });

                    pq.enqueue(neighborStation, newCost); // ★修正点: pathを渡さない
                }
            }
        }

        return { pathFound: false, previous }; // 経路が見つからなかった
    }

    /**
     * ★新規追加: previousマップから経路(PathStep[])を復元する
     */
    private reconstructPath(
        previous: Map<string, { parentStation: string; lineName: string | null; }>,
        startStationName: string,
        endStationName: string
    ): PathStep[] | null {

        const path: PathStep[] = [];
        let currentStation = endStationName;

        // 終点から始点まで逆順に辿る
        while (currentStation !== startStationName) {
            const parentInfo = previous.get(currentStation);
            if (!parentInfo) {
                return null; // 経路が途切れている（エラー）
            }

            path.unshift({ stationName: currentStation, lineName: parentInfo.lineName });
            currentStation = parentInfo.parentStation;
        }

        // 始点を追加
        path.unshift({ stationName: startStationName, lineName: null });

        // lineNameを次の駅（親）のものに付け替える
        const finalPath: PathStep[] = [];
        for (let i = 0; i < path.length; i++) {
            if (i === path.length - 1) {
                // 最後の駅
                finalPath.push({ stationName: path[i].stationName, lineName: null });
            } else {
                // 途中の駅：次の駅（＝復元時は親）の路線名を採用する
                finalPath.push({ stationName: path[i].stationName, lineName: path[i + 1].lineName });
            }
        }

        return finalPath;
    }

    /**
     * メモ化された「通し運賃」計算
     * (旧: getMemoizedFare)
     */
    private getMemoizedFare(path: PathStep[]): number {
        const key = path.map(seg => `${seg.stationName}-${seg.lineName}`)
            .join("-");
        if (this.fareMemo.has(key)) {
            return this.fareMemo.get(key)!;
        }

        const correctedPath = correctPath(path);
        const segmentFare = calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);

        this.fareMemo.set(key, segmentFare);
        return segmentFare;
    }

    /**
     * ステップ2: 確定した1本の経路の最適分割解を計算する（動的計画法）
     * (旧: findBestSplitForPath)
     */
    private calculateOptimalSplitForPath(fullPath: PathStep[]): SplitApiResponse | null {
        const key = fullPath.map(seg => `${seg.stationName}-${seg.lineName}`)
            .join("-");
        if (this.splitMemo.has(key)) {
            return this.splitMemo.get(key)!;
        }

        const n = fullPath.length;
        if (n <= 1) return null;

        const dp = new Array(n).fill(Infinity);
        const from = new Array(n).fill(0);
        dp[0] = 0;

        for (let i = 1; i < n; i++) {
            for (let j = 0; j < i; j++) {
                const subPath = fullPath.slice(j, i + 1);

                // メモ化された「通し運賃」を呼び出す
                const segmentFare = this.getMemoizedFare(subPath);

                const newTotalFare = dp[j] + segmentFare;

                if (newTotalFare < dp[i]) {
                    dp[i] = newTotalFare;
                    from[i] = j;
                }
            }
        }

        const totalFare = dp[n - 1];
        const segments: SplitSegment[] = [];
        let currentIndex = n - 1;

        while (currentIndex > 0) {
            const prevIndex = from[currentIndex];
            const segmentPath = fullPath.slice(prevIndex, currentIndex + 1);

            // メモ化された「通し運賃」を呼び出す
            const segmentFare = this.getMemoizedFare(segmentPath);

            const correctedPath = correctPath(segmentPath);
            const printedViaLines = generatePrintedViaStrings(correctedPath);

            segments.unshift({
                departureStation: fullPath[prevIndex].stationName,
                arrivalStation: fullPath[currentIndex].stationName,
                fare: segmentFare,
                printedViaLines: printedViaLines
            });
            currentIndex = prevIndex;
        }

        const result = { totalFare, segments };
        this.splitMemo.set(key, result); // 分割計算の結果もメモ化
        return result;
    }
}

export const calcSplit = new CalculatorSplit();