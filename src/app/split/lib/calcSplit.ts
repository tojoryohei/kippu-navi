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
    // 分割計算のメモ化用マップ
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
        const MAX_ITERATIONS = 100;

        // --- 1. 経路候補の列挙 ---
        for (let i = 0; i < MAX_ITERATIONS; i++) {
            const { pathFound, previous } = this.findShortestPathByGiseiKilo(startStationName, endStationName, penaltyMap);

            // 経路が見つからなければ探索終了
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

        // ★追加: 経路が1つも見つからなかった場合（孤立路線など）のエラー処理
        // これがないと、後続の処理で空配列に対して generateKippu を呼び出してエラーになります
        if (candidates.length === 0) {
            return null;
        }

        // --- 2. 全候補の計算と集計 ---
        let minThroughFare = Infinity;
        let minThroughPath: PathStep[] = []; // ここはcandidatesが空でない限り必ず上書きされます

        // 全ての候補から出た分割案をフラットに格納する配列
        let allSplitPatterns: SplitKippuDatas[] = [];

        for (const path of candidates) {
            // 通し運賃の最安チェック
            const throughFare = this.getMemoizedFare(path);
            if (throughFare < minThroughFare) {
                minThroughFare = throughFare;
                minThroughPath = path;
            }

            // 分割運賃の計算
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

        // 最安値と一致するパターンのみを抽出
        const optimalPatterns = allSplitPatterns.filter(p => p.totalFare === globalMinFare);

        return {
            shortestData: generateKippu(minThroughPath),
            splitKippuDatasList: optimalPatterns
        };
    }

    /**
     * 1本の経路に対し、最安となる「全ての」分割パターンを返す
     */
    private calculateOptimalSplitForPath(fullPath: PathStep[]): SplitKippuDatas[] | null {
        const key = fullPath.map(seg => `${seg.stationName}-${seg.lineName}`).join("-");
        if (this.splitMemo.has(key)) {
            return this.splitMemo.get(key)!;
        }

        const n = fullPath.length;
        if (n <= 1) return null;

        const dp = new Array(n).fill(Infinity);
        const from: number[][] = Array.from({ length: n }, () => []);

        dp[0] = 0;

        for (let i = 1; i < n; i++) {
            for (let j = 0; j < i; j++) {
                const subPath = fullPath.slice(j, i + 1);
                const segmentFare = this.getMemoizedFare(subPath);
                const newTotalFare = dp[j] + segmentFare;

                if (newTotalFare < dp[i]) {
                    dp[i] = newTotalFare;
                    from[i] = [j];
                } else if (newTotalFare === dp[i]) {
                    from[i].push(j);
                }
            }
        }

        // --- 経路復元 (再帰DFS) ---
        const resultPatterns: SplitKippuDatas[] = [];
        const totalFare = dp[n - 1];

        const reconstruct = (currentIndex: number, currentSegments: SplitKippuData[]) => {
            if (currentIndex === 0) {
                resultPatterns.push({
                    totalFare: totalFare,
                    splitKippuDatas: [...currentSegments]
                });
                return;
            }

            const parents = from[currentIndex];
            for (const prevIndex of parents) {
                const segmentPath = fullPath.slice(prevIndex, currentIndex + 1);

                const newSegment: SplitKippuData = {
                    departureStation: fullPath[prevIndex].stationName,
                    arrivalStation: fullPath[currentIndex].stationName,
                    kippuData: generateKippu(segmentPath)
                };

                reconstruct(prevIndex, [newSegment, ...currentSegments]);
            }
        };

        reconstruct(n - 1, []);

        this.splitMemo.set(key, resultPatterns);
        return resultPatterns;
    }

    // --- 以下、変更なし ---

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
        // 経路が見つからなかった場合は false を返す
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