import { loadSplit } from '@/app/split/lib/loadSplit';
import { calculateFareFromPath, calculateBarrierFreeFeeFromPath } from '@/components/calcFare';
import { correctPath } from '@/components/correctPath';
import { generatePrintedViaStrings } from '@/app/utils/calc';
import { SplitSegment, SplitApiResponse, PathStep } from '@/app/types';

class PriorityQueue {
    private heap: { stationName: string; cost: number; path: PathStep[] }[] = [];

    isEmpty(): boolean {
        return this.heap.length === 0;
    }

    enqueue(stationName: string, cost: number, path: PathStep[]): void {
        this.heap.push({ stationName, cost, path });
        this.heap.sort((a, b) => a.cost - b.cost);
    }

    dequeue(): { stationName: string; cost: number; path: PathStep[] } | null {
        return this.heap.shift() || null;
    }
}

class CalculatorSplit {
    public findCheapestRoute(startStationName: string, endStationName: string): SplitApiResponse | null {
        const costs: Map<string, number> = new Map();
        const pq = new PriorityQueue();
        costs.set(startStationName, 0);
        const startNeighbors = loadSplit.getNeighbors(startStationName);

        for (const neighbor of startNeighbors) {
            const segments = loadSplit.getSegmentsForStationPair(startStationName, neighbor);
            if (segments.length === 0) continue;
            const segment = segments[0];

            const path: PathStep[] = [
                { stationName: startStationName, lineName: segment.line },
                { stationName: neighbor, lineName: null }
            ];

            const correctedPath = correctPath(path)[0];
            const fare = calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);

            if (!costs.has(neighbor) || fare < (costs.get(neighbor) || Infinity)) {
                costs.set(neighbor, fare);
                pq.enqueue(neighbor, fare, path);
            }
        }

        let bestFareToEndStation = Infinity;
        let finalResult: { cost: number, path: PathStep[] } | null = null;

        while (!pq.isEmpty()) {
            const { stationName: currentStation, cost: currentCost, path: currentPath } = pq.dequeue()!;

            if (currentCost > bestFareToEndStation) {
                break;
            }

            if (currentCost > (costs.get(currentStation) || Infinity)) {
                continue;
            }

            if (currentStation === endStationName) {
                bestFareToEndStation = currentCost;
                finalResult = { cost: currentCost, path: currentPath };
                continue;
            }

            const neighbors = loadSplit.getNeighbors(currentStation);

            for (const neighborStation of neighbors) {

                if (currentPath.some(step => step.stationName === neighborStation)) {
                    continue;
                }

                const segments = loadSplit.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;
                const representativeSegment = segments[0];

                const newPath: PathStep[] = currentPath.slice(0, -1); // 最後の要素（終点）を一旦削除
                newPath.push({ stationName: currentStation, lineName: representativeSegment.line }); // 終点にlineNameを追加して戻す
                newPath.push({ stationName: neighborStation, lineName: null }); // 新しい終点を追加

                const correctedPath = correctPath(newPath)[0];
                const cost_通し = calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);

                let cost_分割 = Infinity;
                for (let j = 0; j < newPath.length - 1; j++) {
                    const station_j = newPath[j].stationName;
                    const cost_j_まで = costs.get(station_j); // 始点からj駅までの最安運賃

                    if (cost_j_まで === undefined) continue; // 始点からj駅までのコストが未計算

                    const path_j_から = newPath.slice(j); // j駅から終点までの経路
                    const correctedPath = correctPath(path_j_から)[0];
                    const fare_j_から = calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);

                    cost_分割 = Math.min(cost_分割, cost_j_まで + fare_j_から);
                }

                const newCost = Math.min(cost_通し, cost_分割);

                if (!costs.has(neighborStation) || newCost < (costs.get(neighborStation) || Infinity)) {
                    costs.set(neighborStation, newCost);
                    pq.enqueue(neighborStation, newCost, newPath);
                }
            }
        }

        if (!finalResult) {
            return null;
        }

        return this.findBestSplitForPath(finalResult.path);
    }

    private findBestSplitForPath(fullPath: PathStep[]): SplitApiResponse | null {
        const n = fullPath.length;
        if (n <= 1) return null;

        const dp = new Array(n).fill(Infinity);
        const from = new Array(n).fill(0);
        dp[0] = 0;

        for (let i = 1; i < n; i++) {
            for (let j = 0; j < i; j++) {
                const subPath = fullPath.slice(j, i + 1);
                const correctedPath = correctPath(subPath)[0];
                const segmentFare = calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);
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
            const correctedPath = correctPath(segmentPath)[0];
            const segmentFare = calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);
            const printedViaLines = generatePrintedViaStrings(correctedPath);

            segments.unshift({
                departureStation: fullPath[prevIndex].stationName,
                arrivalStation: fullPath[currentIndex].stationName,
                fare: segmentFare,
                printedViaLines: printedViaLines
            });
            currentIndex = prevIndex;
        }

        return { totalFare, segments };
    }
}

export const calcSplit = new CalculatorSplit();