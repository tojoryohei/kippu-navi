import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';
import { load } from '@/app/utils/load';
import { KippuData, MajorCitySuburbanSectionFare, PathStep, Section } from '@/app/types';
import { applyOneSideCityRule, applyOneSideYamanoteRule, calculateTotalEigyoKilo, convertPathStepsToRouteSegments, generatePrintedViaStrings } from '@/app/utils/calc';
import { calculateFareFromPath } from '@/app/utils/calcFare';
import { applyBoldLineAreaRule, applyKitashinchiRule, applyOsakaRule } from '@/app/utils/correctPath';

// ----------------------------------------------------------------------
// 優先度付きキュー
// ----------------------------------------------------------------------
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

// ----------------------------------------------------------------------
// 電車特定区間のグラフ管理クラス
// ----------------------------------------------------------------------
class trainSpecificRoute {
    private trainSpecificStations: Set<string> = new Set();
    private adjacentTrainSpecificStationsList: Map<string, string[]> = new Map();
    constructor() {
        this.loadTrainSpecificRoutes();
    }

    private loadTrainSpecificRoutes() {
        try {
            const rawData = fs.readFileSync(path.join(process.cwd(), 'src/data/trainSpecificSections.json'), 'utf-8');
            const routes: Section[] = JSON.parse(rawData)["電車特定区間"];

            const EXCLUDED_NAMES = [
                "京都市内",
                "大阪市内",
                "大阪・新大阪",
                "神戸市内"
            ];

            for (const route of routes) {
                if ((route.station0 === "北新地" && route.station1 === "尼崎") ||
                    (route.station0 === "尼崎" && route.station1 === "北新地")
                ) continue;

                if (EXCLUDED_NAMES.some(name =>
                    route.station0 === name || route.station1 === name
                )) {
                    continue;
                }

                this.trainSpecificStations.add(route.station0);
                this.trainSpecificStations.add(route.station1);

                if (!this.adjacentTrainSpecificStationsList.has(route.station0)) this.adjacentTrainSpecificStationsList.set(route.station0, []);
                if (!this.adjacentTrainSpecificStationsList.has(route.station1)) this.adjacentTrainSpecificStationsList.set(route.station1, []);
                if (!this.adjacentTrainSpecificStationsList.get(route.station0)!.includes(route.station1)) {
                    this.adjacentTrainSpecificStationsList.get(route.station0)!.push(route.station1);
                }
                if (!this.adjacentTrainSpecificStationsList.get(route.station1)!.includes(route.station0)) {
                    this.adjacentTrainSpecificStationsList.get(route.station1)!.push(route.station0);
                }
            }
        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getTrainSpecificStations(): Set<string> {
        return this.trainSpecificStations;
    }

    public getAdjacentTrainSpecificRoutes(stationName: string): string[] {
        return this.adjacentTrainSpecificStationsList.get(stationName) || [];
    }
}

// ----------------------------------------------------------------------
// 大都市近郊区間のグラフ管理クラス
// ----------------------------------------------------------------------
interface MajorCitySuburbanStation {
    東京近郊区間: Set<string>;
    大阪近郊区間: Set<string>;
    福岡近郊区間: Set<string>;
    新潟近郊区間: Set<string>;
    仙台近郊区間: Set<string>;
}

interface AdjacentMajorCitySuburbanStationsList {
    東京近郊区間: Map<string, string[]>;
    大阪近郊区間: Map<string, string[]>;
    福岡近郊区間: Map<string, string[]>;
    新潟近郊区間: Map<string, string[]>;
    仙台近郊区間: Map<string, string[]>;
}

class majorCitySuburbanSection {

    private majorCitySuburbanStations: MajorCitySuburbanStation = {
        東京近郊区間: new Set(),
        大阪近郊区間: new Set(),
        福岡近郊区間: new Set(),
        新潟近郊区間: new Set(),
        仙台近郊区間: new Set()
    };

    private adjacentMajorCitySuburbanStationsList: AdjacentMajorCitySuburbanStationsList = {
        東京近郊区間: new Map(),
        大阪近郊区間: new Map(),
        福岡近郊区間: new Map(),
        新潟近郊区間: new Map(),
        仙台近郊区間: new Map()
    };

    constructor() {
        this.loadMajorCitySuburbanSection();
    }

    private loadMajorCitySuburbanSection() {
        try {
            const majorCitySuburbanSectionsData = path.join(process.cwd(), 'src', 'data', 'majorCitySuburbanSections.json');
            const rawMajorCitySuburbanSectionsData: Record<string, Section[]> = JSON.parse(fs.readFileSync(majorCitySuburbanSectionsData, 'utf-8'));

            const EXCLUDED_NAMES = [
                "東京都区内",
                "東京山手線内",
                "札幌市内",
                "仙台市内",
                "横浜市内",
                "名古屋市内",
                "京都市内",
                "大阪市内",
                "大阪・新大阪",
                "神戸市内",
                "広島市内",
                "北九州市内",
                "福岡市内"
            ];

            for (const majorCityName in rawMajorCitySuburbanSectionsData) {
                if (Object.prototype.hasOwnProperty.call(rawMajorCitySuburbanSectionsData, majorCityName)) {
                    const key = majorCityName as keyof MajorCitySuburbanStation;
                    const routes = rawMajorCitySuburbanSectionsData[key];
                    for (const route of routes) {
                        if (route.station0 === "北新地" && route.station1 === "尼崎" ||
                            route.station0 === "尼崎" && route.station1 === "北新地"
                        ) continue;

                        if (EXCLUDED_NAMES.some(name =>
                            route.station0 === name || route.station1 === name
                        )) {
                            continue;
                        }

                        this.majorCitySuburbanStations[key].add(route.station0);
                        this.majorCitySuburbanStations[key].add(route.station1);

                        if (!this.adjacentMajorCitySuburbanStationsList[key].has(route.station0)) this.adjacentMajorCitySuburbanStationsList[key].set(route.station0, []);
                        if (!this.adjacentMajorCitySuburbanStationsList[key].has(route.station1)) this.adjacentMajorCitySuburbanStationsList[key].set(route.station1, []);

                        if (!this.adjacentMajorCitySuburbanStationsList[key].get(route.station0)!.includes(route.station1)) {
                            this.adjacentMajorCitySuburbanStationsList[key].get(route.station0)!.push(route.station1);
                        }
                        if (!this.adjacentMajorCitySuburbanStationsList[key].get(route.station1)!.includes(route.station0)) {
                            this.adjacentMajorCitySuburbanStationsList[key].get(route.station1)!.push(route.station0);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getMajorCitySuburbanStations(majorCityName: keyof MajorCitySuburbanStation): Set<string> {
        return this.majorCitySuburbanStations[majorCityName];
    }

    public getAdjacentMajorCitySuburbanRoutes(majorCityName: keyof MajorCitySuburbanStation, stationName: string): string[] {
        return this.adjacentMajorCitySuburbanStationsList[majorCityName].get(stationName) || [];
    }
}

// ----------------------------------------------------------------------
// キャッシュ生成用クラス
// ----------------------------------------------------------------------
class SuburbanCacheGenerator {
    private trainSpecificRoutes = new trainSpecificRoute();
    private majorCitySuburbanSection = new majorCitySuburbanSection();

    public async generateCacheForArea(majorCityName: keyof MajorCitySuburbanStation): Promise<MajorCitySuburbanSectionFare[]> {
        const cacheResult: MajorCitySuburbanSectionFare[] = [];
        const stations = Array.from(this.majorCitySuburbanSection.getMajorCitySuburbanStations(majorCityName));
        const totalStations = stations.length;
        let processedCount = 0;
        const cities = load.getCities();
        const yamanote = load.getYamanote();
        const stationsInYamanote = new Set(yamanote.stations);

        for (let i = 0; i < totalStations; i++) {
            const startStation = stations[i];

            for (let j = 0; j < totalStations; j++) {
                const endStation = stations[j];

                if (startStation === endStation) continue;

                // ------------------------------------------------------------------
                // 【3パターンの最短経路を探索】 (大都市近郊区間のグラフに限定)
                // ------------------------------------------------------------------
                const candidatePaths: PathStep[][] = [];

                // 1. 最短擬制キロでの経路
                const giseiPathRes = this.findShortestPathByGiseiKilo(majorCityName, startStation, endStation);
                if (giseiPathRes.pathFound) {
                    candidatePaths.push(this.reconstructPath(giseiPathRes.previous, startStation, endStation)!);
                }

                // 2. 最短営業キロでの経路
                const eigyoPathRes = this.findShortestPathByEigyoKilo(majorCityName, startStation, endStation);
                if (eigyoPathRes.pathFound) {
                    candidatePaths.push(this.reconstructPath(eigyoPathRes.previous, startStation, endStation)!);
                }

                // 3. 電車特定区間内での最短営業キロ経路 (発着駅がどちらも特定区間内の場合のみ)
                if (this.trainSpecificRoutes.getTrainSpecificStations().has(startStation) && this.trainSpecificRoutes.getTrainSpecificStations().has(endStation)) {
                    const tsPathRes = this.findShortestPathTrainSpecific(startStation, endStation);
                    if (tsPathRes.pathFound) {
                        candidatePaths.push(this.reconstructPath(tsPathRes.previous, startStation, endStation)!);
                    }
                }

                if (candidatePaths.length === 0) {
                    console.error("経路が見つかりません:", startStation, endStation);
                    continue;
                }

                let cheapestKippu: KippuData | null = null;
                let minFare = Infinity;

                for (let k = 0; k < candidatePaths.length; k++) {
                    let correctedPath = candidatePaths[k];
                    let centerStation = "東京";

                    // 山手線内・特定都区市内の中心駅までの距離計算
                    if (stationsInYamanote.has(startStation) === false && stationsInYamanote.has(endStation) === true) {
                        const shortestPath = this.getShortestGiseiPath(majorCityName, startStation, centerStation)!;
                        const routeSegments = convertPathStepsToRouteSegments(shortestPath);
                        const eigyoKilo = calculateTotalEigyoKilo(routeSegments);
                        if (1000 < eigyoKilo && eigyoKilo <= 2000) {
                            correctedPath = applyOneSideYamanoteRule(shortestPath, "backward")!;
                        }
                    }
                    if (stationsInYamanote.has(startStation) === true && stationsInYamanote.has(endStation) === false) {
                        const shortestPath = this.getShortestGiseiPath(majorCityName, centerStation, endStation)!;
                        const routeSegments = convertPathStepsToRouteSegments(shortestPath);
                        const eigyoKilo = calculateTotalEigyoKilo(routeSegments);
                        if (1000 < eigyoKilo && eigyoKilo <= 2000) {
                            correctedPath = applyOneSideYamanoteRule(shortestPath, "forward")!;
                        }
                    }

                    for (const city of cities) {
                        switch (city.name) {
                            case "札幌市内": centerStation = "札幌"; break;
                            case "仙台市内": centerStation = "仙台"; break;
                            case "東京都区内": centerStation = "東京"; break;
                            case "横浜市内": centerStation = "横浜"; break;
                            case "名古屋市内": centerStation = "名古屋"; break;
                            case "京都市内": centerStation = "京都"; break;
                            case "大阪市内": centerStation = "大阪"; break;
                            case "神戸市内": centerStation = "神戸"; break;
                            case "広島市内": centerStation = "広島"; break;
                            case "北九州市内": centerStation = "小倉"; break;
                            case "福岡市内": centerStation = "博多"; break;
                        }
                        const stationsInCity = new Set(city.stations);
                        if (stationsInCity.has(startStation) === false && stationsInCity.has(endStation) === true) {
                            const shortestPath = this.getShortestGiseiPath(majorCityName, startStation, centerStation)!;
                            const routeSegments = convertPathStepsToRouteSegments(shortestPath);
                            const eigyoKilo = calculateTotalEigyoKilo(routeSegments);
                            if (2000 < eigyoKilo) {
                                correctedPath = applyOneSideCityRule(shortestPath, "backward")!;
                            }
                        }
                        if (stationsInCity.has(startStation) === true && stationsInCity.has(endStation) === false) {
                            const shortestPath = this.getShortestGiseiPath(majorCityName, centerStation, endStation)!;
                            const routeSegments = convertPathStepsToRouteSegments(shortestPath);
                            const eigyoKilo = calculateTotalEigyoKilo(routeSegments);
                            if (2000 < eigyoKilo) {
                                correctedPath = applyOneSideCityRule(shortestPath, "forward")!;
                            }
                        }
                    }
                    correctedPath = applyBoldLineAreaRule(correctedPath);
                    correctedPath = applyOsakaRule(correctedPath);
                    correctedPath = applyKitashinchiRule(correctedPath);

                    if (stationsInYamanote.has(startStation) === true || stationsInYamanote.has(endStation) === true) {
                        for (let i = 0; i < correctedPath.length - 2; i++) {
                            if (correctedPath[i].stationName === "東京" &&
                                correctedPath[i].lineName === "トウホ" &&
                                correctedPath[i + 1].stationName === "神田" &&
                                correctedPath[i + 1].lineName === "チユト" &&
                                correctedPath[i + 2].stationName === "御茶ノ水"
                            ) {
                                correctedPath[i].lineName = "チユト";
                                console.log("東京-神田を中央東に補正", startStation, endStation);
                                break;
                            }
                            if (correctedPath[i].stationName === "御茶ノ水" &&
                                correctedPath[i].lineName === "チユト" &&
                                correctedPath[i + 1].stationName === "神田" &&
                                correctedPath[i + 1].lineName === "トウホ" &&
                                correctedPath[i + 2].stationName === "東京"
                            ) {
                                correctedPath[i + 1].lineName = "チユト";
                                console.log("神田-東京を中央東に補正", startStation, endStation);
                                break;
                            }
                        }
                    }

                    const kippuData: KippuData = {
                        totalEigyoKilo: calculateTotalEigyoKilo(convertPathStepsToRouteSegments(correctedPath)),
                        departureStation: correctedPath[0].stationName,
                        arrivalStation: correctedPath[correctedPath.length - 1].stationName,
                        printedViaLines: generatePrintedViaStrings(correctedPath),
                        fare: calculateFareFromPath(correctedPath),
                        validDays: 1
                    };

                    if (kippuData.fare < minFare) {
                        minFare = kippuData.fare;
                        cheapestKippu = kippuData;
                        if (k !== 0) {
                            console.log(`${startStation} -> ${endStation} (Pattern: ${k})`);
                        }
                    }
                }

                if (cheapestKippu) {
                    cacheResult.push({
                        startStation: startStation,
                        endStation: endStation,
                        kippuData: cheapestKippu
                    });
                }
            }

            processedCount++;
            console.log(`[Progress] ${majorCityName}: ${processedCount}/${totalStations} 駅完了: ${startStation}`);
        }
        return cacheResult;
    }

    private getShortestGiseiPath(majorCityName: keyof MajorCitySuburbanStation, startStation: string, endStation: string): PathStep[] | null {
        const res = this.findShortestPathByGiseiKilo(majorCityName, startStation, endStation);
        if (!res.pathFound) return null;
        return this.reconstructPath(res.previous, startStation, endStation);
    }

    // ----------------------------------------------------------------------
    // ヘルパーメソッド（ダイクストラ法 x 3種類）
    // ----------------------------------------------------------------------

    // 1. 最短擬制キロ
    private findShortestPathByGiseiKilo(
        majorCityName: keyof MajorCitySuburbanStation,
        startStationName: string,
        endStationName: string
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

            // 対象の大都市近郊区間に属する隣接駅のみを取得
            const neighbors = this.majorCitySuburbanSection.getAdjacentMajorCitySuburbanRoutes(majorCityName, currentStation);

            for (const neighborStation of neighbors) {
                const segments = load.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;
                const representativeSegment = segments[0];
                let weight = representativeSegment.giseiKilo;

                if (representativeSegment.station0 === "南船橋" && representativeSegment.station1 === "西船橋") weight += 1;
                if (representativeSegment.station0 === "西船橋" && representativeSegment.station1 === "南船橋") weight += 1;
                if (representativeSegment.station0 === "千葉みなと" && representativeSegment.station1 === "蘇我") weight += 1;
                if (representativeSegment.station0 === "蘇我" && representativeSegment.station1 === "千葉みなと") weight += 1;
                if (representativeSegment.station0 === "京終" && representativeSegment.station1 === "奈良") weight += 1;
                if (representativeSegment.station0 === "奈良" && representativeSegment.station1 === "京終") weight += 1;

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

    // 2. 最短営業キロ
    private findShortestPathByEigyoKilo(
        majorCityName: keyof MajorCitySuburbanStation,
        startStationName: string,
        endStationName: string
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

            // 対象の大都市近郊区間に属する隣接駅のみを取得
            const neighbors = this.majorCitySuburbanSection.getAdjacentMajorCitySuburbanRoutes(majorCityName, currentStation);

            for (const neighborStation of neighbors) {
                const segments = load.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;
                const representativeSegment = segments[0];
                let weight = representativeSegment.eigyoKilo;

                if (representativeSegment.station0 === "南船橋" && representativeSegment.station1 === "西船橋") weight += 1;
                if (representativeSegment.station0 === "西船橋" && representativeSegment.station1 === "南船橋") weight += 1;
                if (representativeSegment.station0 === "千葉みなと" && representativeSegment.station1 === "蘇我") weight += 1;
                if (representativeSegment.station0 === "蘇我" && representativeSegment.station1 === "千葉みなと") weight += 1;

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

    // 3. 電車特定区間内での最短営業キロ
    private findShortestPathTrainSpecific(
        startStationName: string,
        endStationName: string
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

            // 電車特定区間に属する隣接駅のみを取得
            const neighbors = this.trainSpecificRoutes.getAdjacentTrainSpecificRoutes(currentStation);

            for (const neighborStation of neighbors) {
                const segments = load.getSegmentsForStationPair(currentStation, neighborStation);
                if (segments.length === 0) continue;
                const representativeSegment = segments[0];
                let weight = representativeSegment.eigyoKilo;

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
}

// ----------------------------------------------------------------------
// 実行部分 (SQLite への出力処理)
// ----------------------------------------------------------------------
async function main() {
    const generator = new SuburbanCacheGenerator();
    console.time("CacheGenerationTime");

    // データベースファイルの準備（新規作成）
    const dbPath = path.join(process.cwd(), 'src/data/majorCitySuburbanSectionFares.db');
    if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
    }
    const db = new Database(dbPath);

    db.exec(`
        CREATE TABLE IF NOT EXISTS fares (
            area_name TEXT NOT NULL,
            station_start TEXT NOT NULL,
            station_end TEXT NOT NULL,
            kippu_data_json TEXT NOT NULL,
            PRIMARY KEY (area_name, station_start, station_end)
        );
    `);

    const insertStmt = db.prepare('INSERT OR REPLACE INTO fares (area_name, station_start, station_end, kippu_data_json) VALUES (?, ?, ?, ?)');
    const insertMany = db.transaction((areaName: string, items: MajorCitySuburbanSectionFare[]) => {
        for (const item of items) {
            insertStmt.run(areaName, item.startStation, item.endStation, JSON.stringify(item.kippuData));
        }
    });

    const areas: (keyof MajorCitySuburbanStation)[] = [
        "東京近郊区間",
        "大阪近郊区間",
        "福岡近郊区間",
        "新潟近郊区間",
        "仙台近郊区間"
    ];

    for (const area of areas) {
        console.log(`\n=== ${area} のキャッシュ生成を開始 ===`);
        const result = await generator.generateCacheForArea(area);
        insertMany(area, result);
        console.log(`[DB Insert] ${area} のデータをDBに保存しました。（${result.length} 件）`);
    }

    db.close();
    console.timeEnd("CacheGenerationTime");
    console.log("すべての区間のデータ生成とDB保存が完了しました。");
}

main().catch(error => {
    console.error("エラーが発生しました:", error);
});
