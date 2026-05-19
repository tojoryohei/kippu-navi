import { load } from '@/app/utils/load';
import { loadSplit } from '@/app/split/lib/loadSplit';
import { generateKippu } from '@/app/split/lib/generateKippu';
import { KippuData, PathStep, SplitApiResponse, SplitKippuData, SplitKippuDatas } from '@/app/types';
import { cheapestPathAndFare } from '@/app/utils/cheapestPath';
import { calculateTotalGiseiKilo, convertPathStepsToRouteSegments, createPairKey, round1000, round10000, whichMajorCitySuburbanSections } from '@/app/utils/calc';
import { calculateFareFromPath } from '@/app/utils/calcFare';
import { DistanceLimitExceededError, RouteNotFoundError } from '@/app/utils/errors';

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

export class CalculatorSplit {
    private kippuMemo: Map<string, KippuData> = new Map();
    private splitMemo: Map<string, SplitKippuDatas[] | null> = new Map();

    public findOptimalSplitByShortestGiseiKiloPath(startStationName: string, endStationName: string): SplitApiResponse {

        const DISTANCE_LIMIT = 400;

        const distance = loadSplit.getDistanceBetween(startStationName, endStationName);
        if (distance > DISTANCE_LIMIT) {
            throw new DistanceLimitExceededError(distance, DISTANCE_LIMIT);
        }

        this.kippuMemo.clear();
        this.splitMemo.clear();

        // フェーズ1: K-最短経路アルゴリズム（Yen's Algorithm）による候補ルートの列挙
        const candidates: PathStep[][] = this.yensAlgorithm(startStationName, endStationName);

        if (candidates.length === 0) {
            throw new RouteNotFoundError();
        }

        const allSplitPatterns: SplitKippuDatas[] = [];
        let cheapestKippuData: KippuData | null = null;

        // フェーズ2: 各候補ルートに対する1次元DPでの最適分割の並列評価
        for (const candidate of candidates) {
            const splitPatterns = this.calculateOptimalSplitForPath(candidate);
            if (splitPatterns) {
                allSplitPatterns.push(...splitPatterns);
            }
            const majorCitySuburbanSection = whichMajorCitySuburbanSections(candidate);
            const candidateKippuData = majorCitySuburbanSection === null
                ? generateKippu(candidate)
                : load.getMajorCitySuburbanSectionFares(
                    majorCitySuburbanSection,
                    candidate[0].stationName,
                    candidate[candidate.length - 1].stationName
                );
            if (cheapestKippuData === null || candidateKippuData.fare < cheapestKippuData.fare) {
                cheapestKippuData = candidateKippuData;
            }
        }

        if (cheapestKippuData === null) {
            throw new RouteNotFoundError();
        }

        // 重複排除処理（異なる物理ルートでも、分割結果の切符が同じになるケースをマージ）
        const uniquePatternsMap = new Map<string, SplitKippuDatas>();
        for (const pattern of allSplitPatterns) {
            const signature = pattern.splitKippuDatas.map(d =>
                `${d.departureStation}-${d.arrivalStation}:${JSON.stringify(d.kippuData)}`
            ).join("|");

            if (!uniquePatternsMap.has(signature)) {
                uniquePatternsMap.set(signature, pattern);
            } else {
                const existing = uniquePatternsMap.get(signature)!;
                if (pattern.totalFare < existing.totalFare) {
                    uniquePatternsMap.set(signature, pattern);
                }
            }
        }

        const uniqueSplitPatterns = Array.from(uniquePatternsMap.values());

        if (uniqueSplitPatterns.length === 0) {
            // 分割のメリットが一切ない場合は、最安経路の通し切符を返す
            return { cheapestKippuData: cheapestKippuData, splitKippuDatasList: [] };
        }

        // 全候補の中で最も安い「大域的最適解」を抽出（同額の別パターンも全て含む）
        const globalMinFare = Math.min(...uniqueSplitPatterns.map(p => p.totalFare));
        const optimalPatterns = uniqueSplitPatterns.filter(p => p.totalFare === globalMinFare);

        return {
            cheapestKippuData: cheapestKippuData,
            splitKippuDatasList: optimalPatterns
        };
    }

    private yensAlgorithm(startStation: string, endStation: string): PathStep[][] {
        const A: PathStep[][] = [];
        const B: { path: PathStep[]; cost: number; signature: string }[] = [];
        const bSignatures = new Set<string>();

        const firstPathResult = this.findShortestPathByGiseiKilo(startStation, endStation, new Set(), new Set());
        if (!firstPathResult.pathFound) {
            return [];
        }

        const firstPath = this.reconstructPath(firstPathResult.previous, startStation, endStation);
        if (!firstPath) return [];

        A.push(firstPath);

        // 探索打ち切り条件の計算（理論上の最安値を超える遠回りは足切り）
        const d_min = calculateTotalGiseiKilo(convertPathStepsToRouteSegments(firstPath));
        const C_base = calculateFareFromPath(firstPath);
        const u_best = this.getBestUnitPrice(d_min);
        const alpha = this.getSpecificCityBuffer(startStation, endStation);
        const limitDistance = (C_base / u_best) + alpha;

        const MAX_K = 10; // Web公開用のため、安全を期して上限を調整
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
                        excludedEdges.add(createPairKey(u, v));
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
                        const totalCost = calculateTotalGiseiKilo(convertPathStepsToRouteSegments(totalPath));
                        const signature = this.getPathSignature(totalPath);
                        const existsInB = bSignatures.has(signature);
                        if (!existsInB) {
                            B.push({ path: totalPath, cost: totalCost, signature });
                            bSignatures.add(signature);
                        }
                    }
                }
            }

            if (B.length === 0) break;

            B.sort((a, b) => a.cost - b.cost);
            const bestCandidate = B.shift()!;

            bSignatures.delete(bestCandidate.signature);

            if (bestCandidate.cost > limitDistance) {
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
                const segmentKippu = this.getMemoizedKippuData(subPath);
                const newTotalFare = dp[j] + segmentKippu.fare;

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

                const newSegment = {
                    departureStation: fullPath[prevIndex].stationName,
                    arrivalStation: fullPath[currentIndex].stationName,
                    kippuData: this.getMemoizedKippuData(segmentPath)
                };

                reconstruct(prevIndex, [newSegment, ...currentSegments]);
            }
        };

        reconstruct(n - 1, []);
        this.splitMemo.set(key, resultPatterns);
        return resultPatterns;
    }

    private getBestUnitPrice(distance: number): number {
        if (distance <= 8000) return (580 / 428);
        const totalKilo = Math.ceil(distance / 10);
        const splitKilo = Math.floor((totalKilo - 1) / 40) * 40 + 20;
        const fare = round1000(round10000(1620 * 300 + 1285 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
        return (fare / (splitKilo + 20));
    }

    private getSpecificCityBuffer(startStation: string, endStation: string): number {
        let alpha = 0;
        alpha += loadSplit.getdistanceToCityCenter(startStation);
        alpha += loadSplit.getdistanceToCityCenter(endStation);
        return alpha;
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

            const neighbors = load.getAdjacentStations(currentStation);
            for (const neighborStation of neighbors) {
                if (excludedNodes.has(neighborStation)) continue;
                const edgeKey = createPairKey(currentStation, neighborStation);
                if (excludedEdges.has(edgeKey)) continue;

                const segments = load.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;
                const representativeSegment = segments[0];
                const weight = representativeSegment.giseiKilo;
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

    private getMemoizedKippuData(path: PathStep[]): KippuData {
        let key = "";
        for (let k = 0; k < path.length; k++) {
            const line = (k === path.length - 1) ? "null" : path[k].lineName;
            key += `${path[k].stationName}-${line}`;
            if (k < path.length - 1) key += "-";
        }

        if (this.kippuMemo.has(key)) return this.kippuMemo.get(key)!;

        const calcPath = this.clonePath(path);
        const lastIndex = calcPath.length - 1;
        calcPath[lastIndex].lineName = null;

        const majorCitySuburbanSection = whichMajorCitySuburbanSections(calcPath);
        let kippuData: KippuData;

        if (majorCitySuburbanSection === null) {
            kippuData = generateKippu(cheapestPathAndFare(calcPath).path);
        } else {
            kippuData = load.getMajorCitySuburbanSectionFares(
                majorCitySuburbanSection,
                calcPath[0].stationName,
                calcPath[calcPath.length - 1].stationName
            );
        }

        this.kippuMemo.set(key, kippuData);
        return kippuData;
    }

    private clonePath(path: PathStep[]): PathStep[] {
        return path.map(p => ({ ...p }));
    }
}

export const calcSplit = new CalculatorSplit();
