import fs from 'fs';
import path from 'path';

import { createRouteKey } from '@/app/utils/calc';
import { City, OuterSection, PathStep, Printing, RouteSegment, Section, SpecificFare, TrainSpecificSection } from '@/app/types';

class Load {
    private passingBoldLineAreaRoutes: Map<string, PathStep[]> = new Map();
    private fromBoldLineAreaRoutes: Map<string, PathStep[]> = new Map();
    private toBoldLineAreaRoutes: Map<string, PathStep[]> = new Map();
    private cities: City[] = [];
    private printings: Map<string, string> = new Map();
    private routes: Map<string, RouteSegment> = new Map();
    private routeList: RouteSegment[] = [];
    private specificFares: SpecificFare[] = [];
    private specificFareMap = new Map<string, number>();
    private trainSpecificSections!: TrainSpecificSection;
    private yamanote!: City;
    private specificSections: OuterSection[] = [];
    private selectionSections: OuterSection[] = [];

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {

            // boldLineAreaRoutes.jsonの読み込み
            const boldLineAreaRoutesData = path.join(process.cwd(), 'src', 'data', 'boldLineAreaRoutes.json');
            const boldLineAreaRoutes = JSON.parse(fs.readFileSync(boldLineAreaRoutesData, 'utf-8'));
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

            // printings.jsonの読み込み
            const printingsData = path.join(process.cwd(), 'src', 'data', 'printings.json');
            const printingsList: Printing[] = JSON.parse(fs.readFileSync(printingsData, 'utf-8'));
            for (const printing of printingsList) {
                this.printings.set(printing.kana, printing.print);
            }

            // routes.jsonの読み込み
            const routesData = path.join(process.cwd(), 'src', 'data', 'routes.json');
            this.routeList = JSON.parse(fs.readFileSync(routesData, 'utf-8'));
            for (const route of this.routeList) {
                const key = createRouteKey(route.line, route.station0, route.station1);
                this.routes.set(key, route);
            }

            // additionalRoutes.jsonの読み込み
            const additionalRoutesData = path.join(process.cwd(), 'src', 'data', 'additionalRoutes.json');
            const additionalRoutesist = JSON.parse(fs.readFileSync(additionalRoutesData, 'utf-8'));
            for (const route of additionalRoutesist) {
                const key = createRouteKey(route.line, route.station0, route.station1);
                this.routes.set(key, route);
            }

            // specificFares.jsonの読み込み
            const specificFaresData = path.join(process.cwd(), 'src', 'data', 'specificFares.json');
            this.specificFares = JSON.parse(fs.readFileSync(specificFaresData, 'utf-8'));
            for (const specificFare of this.specificFares) {
                this.specificFareMap.set(specificFare.sections.map(seg => `${seg.stationName}`)
                    .join("-"), specificFare.fare);
            }

            // trainSpecificSections.jsonの読み込み
            const trainSpecificSectionsData = path.join(process.cwd(), 'src', 'data', 'trainSpecificSections.json');
            const rawData: Record<string, Section[]> = JSON.parse(fs.readFileSync(trainSpecificSectionsData, 'utf-8'));
            const transformedSections = {} as TrainSpecificSection;
            for (const sectionName in rawData) {
                if (Object.prototype.hasOwnProperty.call(rawData, sectionName)) {
                    const key = sectionName as keyof TrainSpecificSection;
                    const segments = rawData[key];
                    const routeKeys = segments.map(segment =>
                        createRouteKey(segment.line, segment.station0, segment.station1)
                    );
                    transformedSections[key] = new Set(routeKeys);
                }
            }
            this.trainSpecificSections = transformedSections;

            // yamanote.jsonの読み込み
            const yamanotePath = path.join(process.cwd(), 'src', 'data', 'yamanote.json');
            this.yamanote = JSON.parse(fs.readFileSync(yamanotePath, 'utf-8'));

            // specificSections.jsonの読み込み
            const specificSectionsList = path.join(process.cwd(), 'src', 'data', 'specificSections.json');
            this.specificSections = JSON.parse(fs.readFileSync(specificSectionsList, 'utf-8'));

            // selectionSections.jsonの読み込み
            const selectionSectionsList = path.join(process.cwd(), 'src', 'data', 'selectionSections.json');
            this.selectionSections = JSON.parse(fs.readFileSync(selectionSectionsList, 'utf-8'));

        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getRouteSegment(line: string, stationName0: string, stationName1: string): RouteSegment {
        const key = createRouteKey(line, stationName0, stationName1);
        const routesSegment = this.routes.get(key);
        if (routesSegment === undefined) {
            throw new Error(` ${line}上に${stationName0}と${stationName1}間のデータが見つかりません.`);
        }
        return routesSegment;
    }

    public getRoutesList(): RouteSegment[] {
        return this.routeList;
    }

    public getSpecificFares(fullPath: PathStep[]): number | null {
        const key = fullPath
            .map(seg => `${seg.stationName}`)
            .join("-");
        return this.specificFareMap.get(key) ?? null;
    }

    public getTrainSpecificSections(specificSectionName: keyof TrainSpecificSection): Set<string> {
        return this.trainSpecificSections[specificSectionName];
    }

    public getPassingBoldLineAreaRoute(key: string): PathStep[] | null {
        return this.passingBoldLineAreaRoutes.get(key) ?? null;
    }

    public getFromBoldLineAreaRoute(key: string): PathStep[] | null {
        return this.fromBoldLineAreaRoutes.get(key) ?? null;
    }

    public getToBoldLineAreaRoute(key: string): PathStep[] | null {
        return this.toBoldLineAreaRoutes.get(key) ?? null;
    }

    public getCities(): City[] {
        return this.cities;
    }

    public getYamanote(): City {
        return this.yamanote;
    }

    public getPrinting(kana: string): string | null {
        return this.printings.get(kana) ?? null;
    }

    public getSpecificSections(): OuterSection[] {
        return this.specificSections;
    }

    public getSelectionSections(): OuterSection[] {
        return this.selectionSections;
    }

}

// シングルトンインスタンスとしてエクスポートし、アプリ全体で一つのインスタンスを共有する
export const load = new Load();