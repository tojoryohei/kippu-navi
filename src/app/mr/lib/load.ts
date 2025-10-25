import fs from 'fs';
import path from 'path';

import { City, Kana, Line, Printing, RouteSegment, Section, SpecificFare, SpecificSection, Station, TrainSpecificSection } from '@/app/mr/types';

class Load {
    private cities: City[] = [];
    private kanas: Map<string, string> = new Map();
    private lines: Map<string, Line> = new Map();
    private printings: Map<string, string> = new Map();
    private routes: Map<string, RouteSegment> = new Map();
    private specificFares: SpecificFare[] = [];
    private specificSections: SpecificSection[] = [];
    private stations: Map<string, Station> = new Map();
    private trainSpecificSections!: TrainSpecificSection;
    private yamanote!: City;

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {

            // cities.jsonの読み込み
            const citiesPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'cities.json');
            this.cities = JSON.parse(fs.readFileSync(citiesPath, 'utf-8'));

            // kanas.jsonの読み込み
            const kanaList = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'kanas.json');
            const kanaData: Kana[] = JSON.parse(fs.readFileSync(kanaList, 'utf-8'));
            for (const kana of kanaData) {
                const key = this.createRouteKey(kana.line, kana.station0, kana.station1);
                this.kanas.set(key, kana.kana);
            }

            // lines.jsonの読み込み
            const linesPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'lines.json');
            const linesData: Line[] = JSON.parse(fs.readFileSync(linesPath, 'utf-8'));
            for (const line of linesData) {
                this.lines.set(line.name, line);
            }

            // printings.jsonの読み込み
            const printingsList = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'printings.json');
            const printingsData: Printing[] = JSON.parse(fs.readFileSync(printingsList, 'utf-8'));
            for (const printing of printingsData) {
                this.printings.set(printing.kana, printing.print);
            }

            // routes.jsonの読み込み
            const routesPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'routes.json');
            const routesData: RouteSegment[] = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
            for (const route of routesData) {
                const key = this.createRouteKey(route.line, route.station0, route.station1);
                this.routes.set(key, route);
            }

            // specificFares.jsonの読み込み
            const specificFaresPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'specificFares.json');
            this.specificFares = JSON.parse(fs.readFileSync(specificFaresPath, 'utf-8'));

            // specificSections.jsonの読み込み
            const specificSections = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'specificSections.json');
            this.specificSections = JSON.parse(fs.readFileSync(specificSections, 'utf-8'));

            // stations.jsonの読み込み
            const stationPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'stations.json');
            const stationsData: Station[] = JSON.parse(fs.readFileSync(stationPath, 'utf-8'));
            for (const station of stationsData) {
                this.stations.set(station.name, station);
            }

            // trainSpecificSections.jsonの読み込み
            const trainSpecificSections = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'trainSpecificSections.json');
            const rawData: Record<string, Section[]> = JSON.parse(fs.readFileSync(trainSpecificSections, 'utf-8'));
            const transformedSections = {} as TrainSpecificSection;
            for (const sectionName in rawData) {
                if (Object.prototype.hasOwnProperty.call(rawData, sectionName)) {
                    const key = sectionName as keyof TrainSpecificSection;
                    const segments = rawData[key];
                    const routeKeys = segments.map(segment =>
                        this.createRouteKey(segment.line, segment.station0, segment.station1)
                    );
                    transformedSections[key] = new Set(routeKeys);
                }
            }
            this.trainSpecificSections = transformedSections;

            // yamanote.jsonの読み込み
            const yamanotePath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'yamanote.json');
            this.yamanote = JSON.parse(fs.readFileSync(yamanotePath, 'utf-8'));

        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getStationByName(name: string): Station {
        const station = this.stations.get(name);
        if (station === undefined) {
            throw new Error(`${name} が見つかりません.`);
        }
        return station;
    }

    public getLineByName(name: string): Line {
        const line = this.lines.get(name);
        if (line === undefined) {
            throw new Error(` ${name} が見つかりません.`);
        }
        return line;
    }

    public getKana(line: string, stationName0: string, stationName1: string): string {
        const key = this.createRouteKey(line, stationName0, stationName1);
        const kana = this.kanas.get(key);
        if (kana === undefined) {
            throw new Error(` ${key} が見つかりません.`);
        }
        return kana;
    }

    public createRouteKey(line: string, stationName0: string, stationName1: string): string {
        return [line, ...[stationName0, stationName1].sort()].join('-');
    }

    public getRouteSegment(line: string, stationName0: string, stationName1: string): RouteSegment {
        const key = this.createRouteKey(line, stationName0, stationName1);
        const routesSegment = this.routes.get(key);
        if (routesSegment === undefined) {
            throw new Error(` ${line}上に${stationName0}と${stationName1}間のデータが見つかりません.`);
        }
        return routesSegment;
    }

    public getSpecificFares(): SpecificFare[] {
        return this.specificFares;
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