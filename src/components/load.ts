import fs from 'fs';
import path from 'path';

import { createRouteKey } from '@/app/utils/calc';
import { City, PathStep, Printing, RouteSegment, Section, SpecificFare, SpecificSection, TrainSpecificSection } from '@/app/types';

class Load {
    private cities: City[] = [];
    private printings: Map<string, string> = new Map();
    private routes: Map<string, RouteSegment> = new Map();
    private routesData: RouteSegment[] = [];
    private specificFares: SpecificFare[] = [];
    private specificFareMap = new Map<string, number>();
    private specificSections: SpecificSection[] = [];
    private trainSpecificSections!: TrainSpecificSection;
    private yamanote!: City;

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {

            // cities.jsonの読み込み
            const citiesPath = path.join(process.cwd(), 'src', 'data', 'cities.json');
            this.cities = JSON.parse(fs.readFileSync(citiesPath, 'utf-8'));

            // printings.jsonの読み込み
            const printingsList = path.join(process.cwd(), 'src', 'data', 'printings.json');
            const printingsData: Printing[] = JSON.parse(fs.readFileSync(printingsList, 'utf-8'));
            for (const printing of printingsData) {
                this.printings.set(printing.kana, printing.print);
            }

            // routes.jsonの読み込み
            const routesPath = path.join(process.cwd(), 'src', 'data', 'routes.json');
            this.routesData = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
            for (const route of this.routesData) {
                const key = createRouteKey(route.line, route.station0, route.station1);
                this.routes.set(key, route);
            }

            // additionalRoutes.jsonの読み込み
            const additionalRoutesPath = path.join(process.cwd(), 'src', 'data', 'additionalRoutes.json');
            const additionalRoutesData = JSON.parse(fs.readFileSync(additionalRoutesPath, 'utf-8'));
            for (const route of additionalRoutesData) {
                const key = createRouteKey(route.line, route.station0, route.station1);
                this.routes.set(key, route);
            }

            // specificFares.jsonの読み込み
            const specificFaresPath = path.join(process.cwd(), 'src', 'data', 'specificFares.json');
            this.specificFares = JSON.parse(fs.readFileSync(specificFaresPath, 'utf-8'));
            for (const specificFare of this.specificFares) {
                this.specificFareMap.set(specificFare.sections.map(seg => `${seg.stationName}-${seg.lineName}`)
                    .join("-"), specificFare.fare);
            }

            // specificSections.jsonの読み込み
            const specificSections = path.join(process.cwd(), 'src', 'data', 'specificSections.json');
            this.specificSections = JSON.parse(fs.readFileSync(specificSections, 'utf-8'));

            // trainSpecificSections.jsonの読み込み
            const trainSpecificSections = path.join(process.cwd(), 'src', 'data', 'trainSpecificSections.json');
            const rawData: Record<string, Section[]> = JSON.parse(fs.readFileSync(trainSpecificSections, 'utf-8'));
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

    public getRoutesData(): RouteSegment[] {
        return this.routesData;
    }

    public getSpecificFares(fullPath: PathStep[]): number | null {
        const key = fullPath
            .map(seg => `${seg.stationName}-${seg.lineName}`)
            .join("-");
        console.log(key);
        return this.specificFareMap.get(key) ?? null;
    }

    public getSpecificSections(): SpecificSection[] {
        return this.specificSections;
    }

    public getTrainSpecificSections(specificSectionName: keyof TrainSpecificSection): Set<string> {
        return this.trainSpecificSections[specificSectionName];
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
}

// シングルトンインスタンスとしてエクスポートし、アプリ全体で一つのインスタンスを共有する
export const load = new Load();