import fs from 'fs';
import path from 'path';

import { createPairKey, createRouteKey } from '@/app/utils/calc';
import { City, KippuData, MajorCitySuburbanSection, MajorCitySuburbanSectionFare, MajorCitySuburbanSectionFares, OuterSection, PathStep, Printing, RouteSegment, Section, SpecificFare, TrainSpecificSection } from '@/app/types';

class Load {
    private adjacentStationsList: Map<string, string[]> = new Map();
    private cities: City[] = [];
    private fromBoldLineAreaRoutes: Map<string, PathStep[]> = new Map();
    private majorCitySuburbanSectionFares!: MajorCitySuburbanSectionFares;
    private majorCitySuburbanSections!: MajorCitySuburbanSection;
    private passingBoldLineAreaRoutes: Map<string, PathStep[]> = new Map();
    private printings: Map<string, string> = new Map();
    private routes: Map<string, RouteSegment> = new Map();
    private specificFares = new Map<string, number>();
    private toBoldLineAreaRoutes: Map<string, PathStep[]> = new Map();
    private stationPairRoutes: Map<string, RouteSegment[]> = new Map();
    private trainSpecificSections!: TrainSpecificSection;
    private specificSections: OuterSection[] = [];
    private selectionSections: OuterSection[] = [];
    private yamanote!: City;
    constructor () {
        this.loadData();
    }

    private loadData() {
        try {

            // additionalRoutes.jsonの読み込み
            const additionalRoutesData = path.join(process.cwd(), 'src', 'data', 'additionalRoutes.json');
            const additionalRoutesList = JSON.parse(fs.readFileSync(additionalRoutesData, 'utf-8'));
            for (const route of additionalRoutesList) {
                const key = createRouteKey(route.line, route.station0, route.station1);
                this.routes.set(key, route);
            }

            // boldLineAreaRoutes.jsonの読み込み
            const boldLineAreaRoutesData = path.join(process.cwd(), 'src', 'data', 'boldLineAreaRoutes.json');
            const boldLineAreaRoutes: Record<string, { key: string, route: PathStep[] }[]> = JSON.parse(fs.readFileSync(boldLineAreaRoutesData, 'utf-8'));
            for (const boldLineAreaRoute of boldLineAreaRoutes["passing"]) {
                this.passingBoldLineAreaRoutes.set(boldLineAreaRoute.key, boldLineAreaRoute.route);
            }
            for (const boldLineAreaRoute of boldLineAreaRoutes["from"]) {
                this.fromBoldLineAreaRoutes.set(boldLineAreaRoute.key, boldLineAreaRoute.route);
            }
            for (const boldLineAreaRoute of boldLineAreaRoutes["to"]) {
                this.toBoldLineAreaRoutes.set(boldLineAreaRoute.key, boldLineAreaRoute.route);
            }

            // cities.jsonの読み込み
            const citiesData = path.join(process.cwd(), 'src', 'data', 'cities.json');
            this.cities = JSON.parse(fs.readFileSync(citiesData, 'utf-8'));

            // majorCitySuburbanSections.jsonの読み込み
            const majorCitySuburbanSectionsData = path.join(process.cwd(), 'src', 'data', 'majorCitySuburbanSections.json');
            const rawMajorCitySuburbanSectionsData: Record<string, Section[]> = JSON.parse(fs.readFileSync(majorCitySuburbanSectionsData, 'utf-8'));
            const transformedMajorCitySuburbanSections = {} as MajorCitySuburbanSection;
            for (const majorCityName in rawMajorCitySuburbanSectionsData) {
                if (Object.prototype.hasOwnProperty.call(rawMajorCitySuburbanSectionsData, majorCityName)) {
                    const key = majorCityName as keyof MajorCitySuburbanSection;
                    const segments = rawMajorCitySuburbanSectionsData[key];
                    const routeKeys = segments.map(segment =>
                        createRouteKey(segment.line, segment.station0, segment.station1)
                    )
                    transformedMajorCitySuburbanSections[key] = new Set(routeKeys);
                }
            }
            this.majorCitySuburbanSections = transformedMajorCitySuburbanSections;

            // majorCitySuburbanSectionFares.jsonの読み込み
            const majorCitySuburbanSectionFaresData = path.join(process.cwd(), 'src', 'data', 'majorCitySuburbanSectionFares.json');
            const rawMajorCitySuburbanSectionFaresData: Record<string, MajorCitySuburbanSectionFare[]> = JSON.parse(fs.readFileSync(majorCitySuburbanSectionFaresData, 'utf-8'));
            const transformedMajorCitySuburbanSectionFares = {} as MajorCitySuburbanSectionFares;
            for (const majorCityName in rawMajorCitySuburbanSectionFaresData) {
                if (Object.prototype.hasOwnProperty.call(rawMajorCitySuburbanSectionFaresData, majorCityName)) {
                    const key = majorCityName as keyof MajorCitySuburbanSectionFares;
                    const dataArray = rawMajorCitySuburbanSectionFaresData[key];
                    const map = new Map<string, KippuData>();
                    for (const item of dataArray) {
                        map.set(item.key, item.kippuData);
                    }
                    transformedMajorCitySuburbanSectionFares[key] = map;
                }
            }
            this.majorCitySuburbanSectionFares = transformedMajorCitySuburbanSectionFares;

            // printings.jsonの読み込み
            const printingsData = path.join(process.cwd(), 'src', 'data', 'printings.json');
            const printingsList: Printing[] = JSON.parse(fs.readFileSync(printingsData, 'utf-8'));
            for (const printing of printingsList) {
                this.printings.set(printing.kana, printing.print);
            }

            // routes.jsonの読み込み
            const routesData = path.join(process.cwd(), 'src', 'data', 'routes.json');
            const routesList: RouteSegment[] = JSON.parse(fs.readFileSync(routesData, 'utf-8'));
            for (const route of routesList) {
                const key = createRouteKey(route.line, route.station0, route.station1);
                this.routes.set(key, route);

                // 1. 隣接リストの構築
                if (!this.adjacentStationsList.has(route.station0)) this.adjacentStationsList.set(route.station0, []);
                if (!this.adjacentStationsList.has(route.station1)) this.adjacentStationsList.set(route.station1, []);
                if (!this.adjacentStationsList.get(route.station0)!.includes(route.station1)) {
                    this.adjacentStationsList.get(route.station0)!.push(route.station1);
                }
                if (!this.adjacentStationsList.get(route.station1)!.includes(route.station0)) {
                    this.adjacentStationsList.get(route.station1)!.push(route.station0);
                }

                // 2. 駅ペア検索Mapの構築
                const pairKey = createPairKey(route.station0, route.station1);
                if (!this.stationPairRoutes.has(pairKey)) {
                    this.stationPairRoutes.set(pairKey, []);
                }
                this.stationPairRoutes.get(pairKey)!.push(route);
            }

            // selectionSections.jsonの読み込み
            const selectionSectionsList = path.join(process.cwd(), 'src', 'data', 'selectionSections.json');
            this.selectionSections = JSON.parse(fs.readFileSync(selectionSectionsList, 'utf-8'));

            // specificFares.jsonの読み込み
            const specificFaresData = path.join(process.cwd(), 'src', 'data', 'specificFares.json');
            const specificFaresList: SpecificFare[] = JSON.parse(fs.readFileSync(specificFaresData, 'utf-8'));
            for (const specificFare of specificFaresList) {
                this.specificFares.set(specificFare.sections.map(seg => `${seg.stationName}`)
                    .join("-"), specificFare.fare);
            }

            // specificSections.jsonの読み込み
            const specificSectionsList = path.join(process.cwd(), 'src', 'data', 'specificSections.json');
            this.specificSections = JSON.parse(fs.readFileSync(specificSectionsList, 'utf-8'));

            // trainSpecificSections.jsonの読み込み
            const trainSpecificSectionsData = path.join(process.cwd(), 'src', 'data', 'trainSpecificSections.json');
            const rawTrainSpecificSectionsData: Record<string, Section[]> = JSON.parse(fs.readFileSync(trainSpecificSectionsData, 'utf-8'));
            const transformedTrainSpecificSections = {} as TrainSpecificSection;
            for (const sectionName in rawTrainSpecificSectionsData) {
                if (Object.prototype.hasOwnProperty.call(rawTrainSpecificSectionsData, sectionName)) {
                    const key = sectionName as keyof TrainSpecificSection;
                    const segments = rawTrainSpecificSectionsData[key];
                    const routeKeys = segments.map(segment =>
                        createRouteKey(segment.line, segment.station0, segment.station1)
                    );
                    transformedTrainSpecificSections[key] = new Set(routeKeys);
                }
            }
            this.trainSpecificSections = transformedTrainSpecificSections;

            // yamanote.jsonの読み込み
            const yamanotePath = path.join(process.cwd(), 'src', 'data', 'yamanote.json');
            this.yamanote = JSON.parse(fs.readFileSync(yamanotePath, 'utf-8'));

        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getAdjacentStations(stationName: string): string[] {
        return this.adjacentStationsList.get(stationName) || [];
    }

    public getCities(): City[] {
        return this.cities;
    }

    public getFromBoldLineAreaRoute(key: string): PathStep[] | null {
        return this.fromBoldLineAreaRoutes.get(key) ?? null;
    }

    public getMajorCitySuburbanSections(): MajorCitySuburbanSection {
        return this.majorCitySuburbanSections;
    }

    public getMajorCitySuburbanSectionFares(
        majorCitySuburbanSection: keyof MajorCitySuburbanSectionFares,
        startStation: string,
        endStation: string
    ): KippuData {
        const key = `${startStation}-${endStation}`;
        const data = this.majorCitySuburbanSectionFares[majorCitySuburbanSection].get(key);
        if (data === undefined) {
            throw new Error("再考：要求区間誤り");
        }
        return data;
    }

    public getPassingBoldLineAreaRoute(key: string): PathStep[] | null {
        return this.passingBoldLineAreaRoutes.get(key) ?? null;
    }

    public getPrinting(kana: string): string | null {
        return this.printings.get(kana) ?? null;
    }

    public getRouteSegment(line: string, stationName0: string, stationName1: string): RouteSegment {
        const key = createRouteKey(line, stationName0, stationName1);
        const routesSegment = this.routes.get(key);
        if (routesSegment === undefined) {
            throw new Error(` ${line}上に${stationName0}と${stationName1}間のデータが見つかりません.`);
        }
        return routesSegment;
    }

    public getSpecificFares(fullPath: PathStep[]): number | null {
        const key = fullPath
            .map(seg => `${seg.stationName}`)
            .join("-");
        return this.specificFares.get(key) ?? null;
    }

    public getToBoldLineAreaRoute(key: string): PathStep[] | null {
        return this.toBoldLineAreaRoutes.get(key) ?? null;
    }

    public getTrainSpecificSections(trainSpecificSectionName: keyof TrainSpecificSection): Set<string> {
        return this.trainSpecificSections[trainSpecificSectionName];
    }

    public getSpecificSections(): OuterSection[] {
        return this.specificSections;
    }

    public getSegmentsForStationPair(stationName0: string, stationName1: string): RouteSegment[] {
        const pairKey = createPairKey(stationName0, stationName1);
        return this.stationPairRoutes.get(pairKey) || [];
    }

    public getSelectionSections(): OuterSection[] {
        return this.selectionSections;
    }

    public getYamanote(): City {
        return this.yamanote;
    }
}

// シングルトンインスタンスとしてエクスポートし、アプリ全体で一つのインスタンスを共有する
export const load = new Load();
