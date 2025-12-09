import { load } from '@/app/utils/load';
import { loadSplit } from '@/app/split/lib/loadSplit';
import { generateKippu } from '@/app/split/lib/generateKippu';
import { PathStep, SplitApiResponse, SplitKippuData, SplitKippuDatas } from '@/app/types';
import { cheapestPath } from '@/app/utils/cheapestPath';
import { getFareForPath } from '@/app/utils/calc';

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

    private fareMemo: Map<string, number> = new Map();
    private splitMemo: Map<string, SplitKippuDatas[] | null> = new Map();

    public findOptimalSplitByShortestGiseiKiloPath(startStationName: string, endStationName: string): SplitApiResponse | null {

        this.fareMemo.clear();
        this.splitMemo.clear();

        const candidates: PathStep[][] = this.yensAlgorithm(startStationName, endStationName);

        if (candidates.length === 0) {
            return null;
        }

        let minThroughFare = Infinity;
        let minThroughPath: PathStep[] = [];
        let allSplitPatterns: SplitKippuDatas[] = [];

        for (const path of candidates) {
            const throughFare = getFareForPath(path);
            if (throughFare < minThroughFare) {
                minThroughFare = throughFare;
                minThroughPath = path;
            }

            const splitPatterns = this.calculateOptimalSplitForPath(path);
            if (splitPatterns) {
                allSplitPatterns = allSplitPatterns.concat(splitPatterns);
            }
        }

        // console.log("Candidate paths count:", candidates.length);
        // console.log("Candidate paths:", candidates);
        // console.log("Min Through Path:", minThroughPath);

        // ★追加: 重複排除処理 (Deduplication)
        // 分割駅の構成と、各切符の中身(経由印字など)が完全に一致するものを間引きます
        const uniquePatternsMap = new Map<string, SplitKippuDatas>();

        for (const pattern of allSplitPatterns) {
            // シグネチャ生成: 全ての分割区間の [発駅-着駅-切符詳細(JSON)] を連結して一意なキーを作る
            // kippuDataを含めることで、経由印字や有効期間などが違う場合も区別できます
            const signature = pattern.splitKippuDatas.map(d =>
                `${d.departureStation}-${d.arrivalStation}:${JSON.stringify(d.kippuData)}`
            ).join("|");

            if (!uniquePatternsMap.has(signature)) {
                uniquePatternsMap.set(signature, pattern);
            } else {
                // 万が一シグネチャが同じで合計運賃が安いものがあればそちらを採用（念のため）
                const existing = uniquePatternsMap.get(signature)!;
                if (pattern.totalFare < existing.totalFare) {
                    uniquePatternsMap.set(signature, pattern);
                }
            }
        }

        // マップから配列に戻す
        let uniqueSplitPatterns = Array.from(uniquePatternsMap.values());

        // --- 3. グローバル最安値でフィルタリング ---
        if (uniqueSplitPatterns.length === 0) {
            return { shortestData: generateKippu(minThroughPath), splitKippuDatasList: [] };
        }

        const globalMinFare = Math.min(...uniqueSplitPatterns.map(p => p.totalFare));
        const optimalPatterns = uniqueSplitPatterns.filter(p => p.totalFare === globalMinFare);

        return {
            shortestData: generateKippu(minThroughPath),
            splitKippuDatasList: optimalPatterns
        };
    }

    private yensAlgorithm(startStation: string, endStation: string): PathStep[][] {
        const A: PathStep[][] = [];
        const B: { path: PathStep[]; cost: number; signature: string }[] = [];

        const firstPathResult = this.findShortestPathByGiseiKilo(startStation, endStation, new Set(), new Set());
        if (!firstPathResult.pathFound) {
            return [];
        }

        const firstPath = this.reconstructPath(firstPathResult.previous, startStation, endStation);
        if (!firstPath) return [];

        A.push(firstPath);

        const baseDistance = this.calculateTotalGiseiKilo(firstPath);
        const MAX_RATIO = 1.25;
        const MAX_K = 1;

        for (let k = 1; k < MAX_K; k++) {
            const prevPath = A[k - 1];

            for (let i = 0; i < prevPath.length - 1; i++) {
                const spurNode = prevPath[i].stationName;
                const rootPath = prevPath.slice(0, i + 1);

                const excludedEdges = new Set<string>();
                const excludedNodes = new Set<string>();

                for (let r = 0; r < i; r++) {
                    excludedNodes.add(rootPath[r].stationName);
                }

                for (const p of A) {
                    if (this.pathsSharePrefix(p, rootPath)) {
                        const u = p[i].stationName;
                        const v = p[i + 1].stationName;
                        excludedEdges.add(this.getEdgeKey(u, v));
                    }
                }

                const spurPathResult = this.findShortestPathByGiseiKilo(spurNode, endStation, excludedEdges, excludedNodes);

                if (spurPathResult.pathFound) {
                    const spurPathPart = this.reconstructPath(spurPathResult.previous, spurNode, endStation);
                    if (spurPathPart) {
                        const rootPathFixed = [...rootPath];

                        if (rootPathFixed.length > 0 && spurPathPart.length > 0) {
                            const junctionIndex = rootPathFixed.length - 1;

                            rootPathFixed[junctionIndex] = {
                                ...rootPathFixed[junctionIndex],
                                lineName: spurPathPart[0].lineName
                            };
                        }

                        const totalPath = [...rootPathFixed, ...spurPathPart.slice(1)];

                        const totalCost = this.calculateTotalGiseiKilo(totalPath);
                        const signature = this.getPathSignature(totalPath);

                        const existsInB = B.some(b => b.signature === signature);
                        if (!existsInB) {
                            B.push({ path: totalPath, cost: totalCost, signature });
                        }
                    }
                }
            }

            if (B.length === 0) break;

            B.sort((a, b) => a.cost - b.cost);
            const bestCandidate = B.shift()!;

            if (bestCandidate.cost > baseDistance * MAX_RATIO) {
                break;
            }

            if (!A.some(p => this.getPathSignature(p) === bestCandidate.signature)) {
                A.push(bestCandidate.path);
            } else {
                k--;
            }
        }

        return A;
    }

    private getPathSignature(path: PathStep[]): string {
        return path.map(p => p.stationName).join("|");
    }

    private pathsSharePrefix(fullPath: PathStep[], prefix: PathStep[]): boolean {
        if (fullPath.length < prefix.length) return false;
        for (let i = 0; i < prefix.length; i++) {
            if (fullPath[i].stationName !== prefix[i].stationName) return false;
        }
        return true;
    }

    private getEdgeKey(u: string, v: string): string {
        return u < v ? `${u}-${v}` : `${v}-${u}`;
    }

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
                    kippuData: generateKippu(cheapestPath(segmentPath))
                };

                reconstruct(prevIndex, [newSegment, ...currentSegments]);
            }
        };

        reconstruct(n - 1, []);

        this.splitMemo.set(key, resultPatterns);
        return resultPatterns;
    }

    private calculateTotalGiseiKilo(path: PathStep[]): number {
        let total = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const lineName = path[i].lineName;
            if (!lineName) continue;
            total += load.getRouteSegment(lineName, path[i].stationName, path[i + 1].stationName).giseiKilo;
        }
        return total;
    }

    private findShortestPathByGiseiKilo(
        startStationName: string,
        endStationName: string,
        excludedEdges: Set<string>,
        excludedNodes: Set<string>
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
                if (excludedNodes.has(neighborStation)) continue;

                const edgeKey = this.getEdgeKey(currentStation, neighborStation);
                if (excludedEdges.has(edgeKey)) continue;

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

        if (!previous.has(endStationName) && startStationName !== endStationName) return null;

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

        const segmentFare = getFareForPath(cheapestPath(path));

        this.fareMemo.set(key, segmentFare);
        return segmentFare;
    }
}

export const calcSplit = new CalculatorSplit();