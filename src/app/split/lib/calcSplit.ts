import { loadSplit } from '@/app/split/lib/loadSplit';
import { calculateFareFromPath, calculateBarrierFreeFeeFromPath } from '@/components/calcFare';
import { correctPath } from '@/components/correctPath';
import { generateKippu } from '@/app/split/lib/generateKippu';
import { PathStep, SplitApiResponse, SplitKippuData, SplitKippuDatas } from '@/app/types';

/**
 * 優先度付きキュー (変更なし)
 */
class PriorityQueue {
    private heap: { stationName: string; cost: number }[] = [];
    isEmpty(): boolean { return this.heap.length === 0; }
    enqueue(stationName: string, cost: number): void {
        this.heap.push({ stationName, cost });
        this.bubbleUp(this.heap.length - 1);
    }
    dequeue(): { stationName: string; cost: number } | null {
        if (this.isEmpty()) return null;
        if (this.heap.length === 1) return this.heap.pop()!;
        const root = this.heap[0];
        this.heap[0] = this.heap.pop()!;
        this.bubbleDown(0);
        return root;
    }
    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this.heap[index].cost < this.heap[parentIndex].cost) {
                [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
                index = parentIndex;
            } else { break; }
        }
    }
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
            } else { break; }
        }
    }
}

class CalculatorSplit {

    // メモ化用マップ
    private fareMemo: Map<string, number> = new Map();
    // 分割計算のメモ化用マップ（戻り値を配列に変更）
    private splitMemo: Map<string, SplitKippuDatas[] | null> = new Map();

    /**
     * メイン関数
     */
    public findOptimalSplitByShortestGiseiKiloPath(startStationName: string, endStationName: string): SplitApiResponse | null {

        this.fareMemo.clear();
        this.splitMemo.clear();

        const candidates: PathStep[][] = [];
        const foundPathSignatures = new Set<string>();
        const penaltyMap = new Map<string, number>();

        let baseDistance: number | null = null;
        const MAX_ITERATIONS = 5;

        // --- 1. 経路候補の列挙 ---
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const { pathFound, previous } = this.findShortestPathByGiseiKilo(startStationName, endStationName, penaltyMap);
            if (!pathFound) break;

            const path = this.reconstructPath(previous, startStationName, endStationName);
            if (!path) break;

            const signature = path.map(p => p.stationName).join("|");
            if (foundPathSignatures.has(signature)) break;
            foundPathSignatures.add(signature);

            const realDistance = this.calculateTotalGiseiKilo(path);
            if (baseDistance === null) baseDistance = realDistance;
            if (realDistance > baseDistance * 1.1) break;

            candidates.push(path);

            // ペナルティ更新
            for (let j = 0; j < path.length - 1; j++) {
                const u = path[j].stationName;
                const v = path[j + 1].stationName;
                const key = u < v ? `${u}-${v}` : `${v}-${u}`;
                penaltyMap.set(key, (penaltyMap.get(key) || 0) + 1);
            }
        }

        // --- 2. 全候補の計算と集計 ---
        let minThroughFare = Infinity;
        let minThroughPath: PathStep[] = [];

        // 全ての候補から出た分割案をフラットに格納する配列
        let allSplitPatterns: SplitKippuDatas[] = [];

        for (const path of candidates) {
            // 通し運賃の最安チェック
            const throughFare = this.getMemoizedFare(path);
            if (throughFare < minThroughFare) {
                minThroughFare = throughFare;
                minThroughPath = path;
            }

            // 分割運賃の計算 (この経路における最安パターンのリストを取得)
            const splitPatterns = this.calculateOptimalSplitForPath(path);
            if (splitPatterns) {
                allSplitPatterns = allSplitPatterns.concat(splitPatterns);
            }
        }

        // --- 3. グローバル最安値でフィルタリング ---
        if (allSplitPatterns.length === 0) {
            // 分割案がない場合は通しのみ返す
            return { shortestData: generateKippu(minThroughPath), splitKippuDatasList: [] };
        }

        // 全パターンの中での最安値を探す
        const globalMinFare = Math.min(...allSplitPatterns.map(p => p.totalFare));

        // 最安値と一致するパターンのみを抽出（経路が違っても値段が同じなら全て残す）
        const optimalPatterns = allSplitPatterns.filter(p => p.totalFare === globalMinFare);

        return {
            shortestData: generateKippu(minThroughPath),
            splitKippuDatasList: optimalPatterns
        };
    }

    /**
     * 1本の経路に対し、最安となる「全ての」分割パターンを返す
     * 戻り値を SplitKippuDatas[] (配列) に変更
     */
    private calculateOptimalSplitForPath(fullPath: PathStep[]): SplitKippuDatas[] | null {
        const key = fullPath.map(seg => `${seg.stationName}-${seg.lineName}`).join("-");
        if (this.splitMemo.has(key)) {
            return this.splitMemo.get(key)!;
        }

        const n = fullPath.length;
        if (n <= 1) return null;

        const dp = new Array(n).fill(Infinity);
        // ★変更点: 1つの分割点だけでなく、候補を複数持てるように配列の配列にする
        const from: number[][] = Array.from({ length: n }, () => []);

        dp[0] = 0;

        for (let i = 1; i < n; i++) {
            for (let j = 0; j < i; j++) {
                const subPath = fullPath.slice(j, i + 1);
                const segmentFare = this.getMemoizedFare(subPath);
                const newTotalFare = dp[j] + segmentFare;

                // ★変更点: 最安更新時はリセット、同額なら追加
                if (newTotalFare < dp[i]) {
                    dp[i] = newTotalFare;
                    from[i] = [j]; // 新しい最安が見つかったので候補をリセット
                } else if (newTotalFare === dp[i]) {
                    from[i].push(j); // 同額なので候補に追加
                }
            }
        }

        // --- 経路復元 (再帰DFS) ---
        // 同額のパターンすべてを網羅する
        const resultPatterns: SplitKippuDatas[] = [];
        const totalFare = dp[n - 1];

        // 再帰関数: 現在の駅(currentIndex)から親を遡って経路を構築する
        const reconstruct = (currentIndex: number, currentSegments: SplitKippuData[]) => {
            // ゴール(index 0)に到達したら1つのパターン完成
            if (currentIndex === 0) {
                resultPatterns.push({
                    totalFare: totalFare,
                    splitKippuDatas: [...currentSegments] // 逆順で入っているので、呼び出し元はunshift的な順序になるよう調整済み
                });
                return;
            }

            // 親候補をすべて探索
            const parents = from[currentIndex];
            for (const prevIndex of parents) {
                const segmentPath = fullPath.slice(prevIndex, currentIndex + 1);

                const newSegment: SplitKippuData = {
                    departureStation: fullPath[prevIndex].stationName,
                    arrivalStation: fullPath[currentIndex].stationName,
                    kippuData: generateKippu(segmentPath)
                };

                // 再帰呼び出し (現在のセグメントをリストの先頭に追加)
                reconstruct(prevIndex, [newSegment, ...currentSegments]);
            }
        };

        // 最後の駅から探索開始
        reconstruct(n - 1, []);

        this.splitMemo.set(key, resultPatterns);
        return resultPatterns;
    }

    // --- 以下、既存ロジック（変更なし） ---

    private calculateTotalGiseiKilo(path: PathStep[]): number {
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const u = path[i].stationName;
            const v = path[i + 1].stationName;
            const segments = loadSplit.getSegmentsForStationPair(u, v);
            if (segments.length > 0) {
                const lineName = path[i + 1].lineName;
                const seg = segments.find(s => s.line === lineName) || segments[0];
                total += seg.giseiKilo;
            }
        }
        return total;
    }

    private findShortestPathByGiseiKilo(
        startStationName: string,
        endStationName: string,
        penaltyMap: Map<string, number>
    ): { pathFound: boolean; previous: Map<string, { parentStation: string; lineName: string | null; }> } {

        const costs: Map<string, number> = new Map();
        const previous: Map<string, { parentStation: string; lineName: string | null; }> = new Map();
        const pq = new PriorityQueue();

        costs.set(startStationName, 0);
        pq.enqueue(startStationName, 0);

        while (!pq.isEmpty()) {
            const { stationName: currentStation, cost: currentCost } = pq.dequeue()!;
            if (currentCost > (costs.get(currentStation) || Infinity)) continue;
            if (currentStation === endStationName) return { pathFound: true, previous };

            const neighbors = loadSplit.getNeighbors(currentStation);
            for (const neighborStation of neighbors) {
                let isLoop = false;
                let checkStation = currentStation;
                while (previous.has(checkStation)) {
                    const parent = previous.get(checkStation)!.parentStation;
                    if (parent === neighborStation) { isLoop = true; break; }
                    checkStation = parent;
                }
                if (isLoop) continue;

                const segments = loadSplit.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;

                const representativeSegment = segments[0];
                let weight = representativeSegment.giseiKilo;
                const u = currentStation;
                const v = neighborStation;
                const key = u < v ? `${u}-${v}` : `${v}-${u}`;
                const penaltyCount = penaltyMap.get(key) || 0;

                if (penaltyCount > 0) weight = weight * (1 + penaltyCount * 1.0);
                const newCost = currentCost + weight;

                if (!costs.has(neighborStation) || newCost < (costs.get(neighborStation) || Infinity)) {
                    costs.set(neighborStation, newCost);
                    previous.set(neighborStation, { parentStation: currentStation, lineName: representativeSegment.line });
                    pq.enqueue(neighborStation, newCost);
                }
            }
        }
        return { pathFound: false, previous };
    }

    private reconstructPath(previous: Map<string, { parentStation: string; lineName: string | null; }>, startStationName: string, endStationName: string): PathStep[] | null {
        const path: PathStep[] = [];
        let currentStation = endStationName;
        while (currentStation !== startStationName) {
            const parentInfo = previous.get(currentStation);
            if (!parentInfo) return null;
            path.unshift({ stationName: currentStation, lineName: parentInfo.lineName });
            currentStation = parentInfo.parentStation;
        }
        path.unshift({ stationName: startStationName, lineName: null });
        const finalPath: PathStep[] = [];
        for (let i = 0; i < path.length; i++) {
            if (i === path.length - 1) finalPath.push({ stationName: path[i].stationName, lineName: null });
            else finalPath.push({ stationName: path[i].stationName, lineName: path[i + 1].lineName });
        }
        return finalPath;
    }

    private getMemoizedFare(path: PathStep[]): number {
        const lastIndex = path.length - 1;
        const originalLastStep = path[lastIndex];

        // ★ここでの slice+spread による複製は安全です
        path[lastIndex] = { ...originalLastStep, lineName: null };

        const key = path.map(seg => `${seg.stationName}-${seg.lineName}`).join("-");
        if (this.fareMemo.has(key)) return this.fareMemo.get(key)!;

        const correctedPath = correctPath(path);
        const segmentFare = calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);

        this.fareMemo.set(key, segmentFare);
        return segmentFare;
    }
}

export const calcSplit = new CalculatorSplit();