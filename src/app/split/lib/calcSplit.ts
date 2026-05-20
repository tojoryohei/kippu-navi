import { load } from '@/app/utils/load';
import { loadSplit } from '@/app/split/lib/loadSplit';
import { generateKippu } from '@/app/split/lib/generateKippu';
import { KippuData, PathStep, SplitApiResponse, SplitKippuData, SplitKippuDatas } from '@/app/types';
import { cheapestPathAndFare } from '@/app/utils/cheapestPath';
import { calculateTotalGiseiKilo, convertPathStepsToRouteSegments, createPairKey, round1000, round10000, whichMajorCitySuburbanSections } from '@/app/utils/calc';
import { calculateFareFromPath } from '@/app/utils/calcFare';
import { StationCountLimitExceededError, RouteNotFoundError } from '@/app/utils/errors';

class PriorityQueue {
    private names: string[] = [];
    private costs: number[] = [];

    isEmpty(): boolean { return this.names.length === 0; }

    enqueue(stationName: string, cost: number): void {
        this.names.push(stationName);
        this.costs.push(cost);
        this.bubbleUp(this.names.length - 1);
    }

    dequeue(): { stationName: string; cost: number } | null {
        if (this.isEmpty()) return null;

        const rootName = this.names[0];
        const rootCost = this.costs[0];

        if (this.names.length === 1) {
            this.names.pop();
            this.costs.pop();
            return { stationName: rootName, cost: rootCost };
        }

        this.names[0] = this.names.pop()!;
        this.costs[0] = this.costs.pop()!;
        this.bubbleDown(0);

        return { stationName: rootName, cost: rootCost };
    }

    private bubbleUp(index: number): void {
        while (index > 0) {
            const parentIndex = (index - 1) >> 1;
            if (this.costs[index] < this.costs[parentIndex]) {
                this.swap(index, parentIndex);
                index = parentIndex;
            } else { break; }
        }
    }

    private bubbleDown(index: number): void {
        const lastIndex = this.names.length - 1;
        while (true) {
            let leftChildIndex = (index << 1) + 1;
            let rightChildIndex = (index << 1) + 2;
            let smallestIndex = index;

            if (leftChildIndex <= lastIndex && this.costs[leftChildIndex] < this.costs[smallestIndex]) {
                smallestIndex = leftChildIndex;
            }
            if (rightChildIndex <= lastIndex && this.costs[rightChildIndex] < this.costs[smallestIndex]) {
                smallestIndex = rightChildIndex;
            }

            if (smallestIndex !== index) {
                this.swap(index, smallestIndex);
                index = smallestIndex;
            } else { break; }
        }
    }

    private swap(i: number, j: number): void {
        const tempName = this.names[i];
        this.names[i] = this.names[j];
        this.names[j] = tempName;

        const tempCost = this.costs[i];
        this.costs[i] = this.costs[j];
        this.costs[j] = tempCost;
    }
}

export class CalculatorSplit {
    private kippuMemo: Map<string, KippuData> = new Map();
    private splitMemo: Map<string, SplitKippuDatas[] | null> = new Map();

    public findOptimalSplitByShortestGiseiKiloPath(startStationName: string, endStationName: string): SplitApiResponse {
        this.kippuMemo.clear();
        this.splitMemo.clear();

        const candidates: PathStep[][] = this.yensAlgorithm(startStationName, endStationName);

        if (candidates.length === 0) {
            throw new RouteNotFoundError();
        }

        const allSplitPatterns: SplitKippuDatas[] = [];
        let cheapestKippuData: KippuData | null = null;

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

        const uniquePatternsMap = new Map<string, SplitKippuDatas>();
        for (const pattern of allSplitPatterns) {
            let signature = "";
            for (let i = 0; i < pattern.splitKippuDatas.length; i++) {
                const d = pattern.splitKippuDatas[i];
                signature += `${d.departureStation}-${d.arrivalStation}:${JSON.stringify(d.kippuData)}|`;
            }

            const existing = uniquePatternsMap.get(signature);
            if (!existing || pattern.totalFare < existing.totalFare) {
                uniquePatternsMap.set(signature, pattern);
            }
        }

        const uniqueSplitPatterns = Array.from(uniquePatternsMap.values());

        if (uniqueSplitPatterns.length === 0) {
            return { cheapestKippuData: cheapestKippuData, splitKippuDatasList: [] };
        }

        let globalMinFare = Infinity;
        for (let i = 0; i < uniqueSplitPatterns.length; i++) {
            if (uniqueSplitPatterns[i].totalFare < globalMinFare) {
                globalMinFare = uniqueSplitPatterns[i].totalFare;
            }
        }

        const optimalPatterns = uniqueSplitPatterns.filter(p => p.totalFare === globalMinFare);

        return {
            cheapestKippuData: cheapestKippuData,
            splitKippuDatasList: optimalPatterns
        };
    }

    private yensAlgorithm(startStation: string, endStation: string): PathStep[][] {
        const STATIONS_LIMIT = 100;

        const A: PathStep[][] = [];
        const B: { path: PathStep[]; cost: number; signature: string }[] = [];
        const bSignatures = new Set<string>();

        const firstPathResult = this.findShortestPathByGiseiKilo(startStation, endStation, new Set(), new Set());
        if (!firstPathResult.pathFound) return [];

        const firstPath = this.reconstructPath(firstPathResult.previous, startStation, endStation);
        if (!firstPath) return [];

        if (firstPath.length > STATIONS_LIMIT) {
            throw new StationCountLimitExceededError(firstPath.length, STATIONS_LIMIT);
        }

        A.push(firstPath);

        const d_min = calculateTotalGiseiKilo(convertPathStepsToRouteSegments(firstPath));
        const C_base = calculateFareFromPath(firstPath);
        const u_best = this.getBestUnitPrice(d_min);
        const alpha = this.getSpecificCityBuffer(startStation, endStation);
        const limitDistance = (C_base / u_best) + alpha;

        const MAX_K = 10;

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

                for (let pIdx = 0; pIdx < A.length; pIdx++) {
                    const p = A[pIdx];
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
                        const rootPathFixed = rootPath.slice();
                        if (rootPathFixed.length > 0 && spurPathPart.length > 0) {
                            const junctionIndex = rootPathFixed.length - 1;
                            rootPathFixed[junctionIndex] = {
                                stationName: rootPathFixed[junctionIndex].stationName,
                                lineName: spurPathPart[0].lineName
                            };
                        }

                        const totalPath = new Array(rootPathFixed.length + spurPathPart.length - 1);
                        for (let j = 0; j < rootPathFixed.length; j++) totalPath[j] = rootPathFixed[j];
                        for (let j = 1; j < spurPathPart.length; j++) totalPath[rootPathFixed.length + j - 1] = spurPathPart[j];

                        const totalCost = calculateTotalGiseiKilo(convertPathStepsToRouteSegments(totalPath));
                        const signature = this.getPathSignature(totalPath);

                        if (!bSignatures.has(signature)) {
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

            let existsInA = false;
            for (let aIdx = 0; aIdx < A.length; aIdx++) {
                if (this.getPathSignature(A[aIdx]) === bestCandidate.signature) {
                    existsInA = true;
                    break;
                }
            }

            if (!existsInA) {
                A.push(bestCandidate.path);
            } else {
                k--;
            }
        }

        return A;
    }

    private calculateOptimalSplitForPath(fullPath: PathStep[]): SplitKippuDatas[] | null {
        let key = "";
        for (let i = 0; i < fullPath.length; i++) {
            key += `${fullPath[i].stationName}-${fullPath[i].lineName}`;
            if (i < fullPath.length - 1) key += "-";
        }

        if (this.splitMemo.has(key)) {
            return this.splitMemo.get(key)!;
        }

        const n = fullPath.length;
        if (n <= 1) return null;

        const dp = new Float64Array(n);
        dp.fill(Infinity);
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
                    splitKippuDatas: currentSegments
                });
                return;
            }

            const parents = from[currentIndex];
            for (let pIdx = 0; pIdx < parents.length; pIdx++) {
                const prevIndex = parents[pIdx];
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
        return loadSplit.getdistanceToCityCenter(startStation) + loadSplit.getdistanceToCityCenter(endStation);
    }

    private getPathSignature(path: PathStep[]): string {
        let sig = "";
        for (let i = 0; i < path.length; i++) {
            sig += path[i].stationName;
            if (i < path.length - 1) sig += "|";
        }
        return sig;
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
            const dequeued = pq.dequeue();
            if (!dequeued) break;

            const currentStation = dequeued.stationName;
            const currentCost = dequeued.cost;

            const savedCost = costs.get(currentStation);
            if (savedCost !== undefined && currentCost > savedCost) continue;
            if (currentStation === endStationName) return { pathFound: true, previous };

            const neighbors = load.getAdjacentStations(currentStation);
            for (let i = 0; i < neighbors.length; i++) {
                const neighborStation = neighbors[i];

                if (excludedNodes.has(neighborStation)) continue;

                const edgeKey = createPairKey(currentStation, neighborStation);
                if (excludedEdges.has(edgeKey)) continue;

                const segments = load.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;

                const representativeSegment = segments[0];
                const newCost = currentCost + representativeSegment.giseiKilo;

                const neighborSavedCost = costs.get(neighborStation);
                if (neighborSavedCost === undefined || newCost < neighborSavedCost) {
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
            path.push({ stationName: currentStation, lineName: parentInfo.lineName });
            currentStation = parentInfo.parentStation;
        }
        path.push({ stationName: startStationName, lineName: null });

        path.reverse();

        const finalPath: PathStep[] = new Array(path.length);
        for (let i = 0; i < path.length; i++) {
            if (i === path.length - 1) {
                finalPath[i] = { stationName: path[i].stationName, lineName: null };
            } else {
                finalPath[i] = { stationName: path[i].stationName, lineName: path[i + 1].lineName };
            }
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

        const cached = this.kippuMemo.get(key);
        if (cached !== undefined) return cached;

        const calcPath = path.slice();
        const lastIndex = calcPath.length - 1;

        calcPath[lastIndex] = {
            stationName: calcPath[lastIndex].stationName,
            lineName: null
        };

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
}

export const calcSplit = new CalculatorSplit();
