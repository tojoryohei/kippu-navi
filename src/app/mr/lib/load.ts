import fs from 'fs';
import path from 'path';

import { Station, Line, RouteSegment, SpecificFare, SpecificSection, City } from '@/app/mr/types';

class Load {
    private stations: Map<string, Station> = new Map();
    private lines: Map<string, Line> = new Map();
    private routes: Map<string, RouteSegment> = new Map();
    private specificFares: SpecificFare[] = [];
    private specificSections: SpecificSection[] = [];
    private cities: City[] = [];
    private yamanote!: City;

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {
            // stations.jsonの読み込み
            const stationPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'stations.json');
            const stationsData: Station[] = JSON.parse(fs.readFileSync(stationPath, 'utf-8'));
            for (const station of stationsData) {
                this.stations.set(station.name, station);
            }

            // lines.jsonの読み込み
            const linesPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'lines.json');
            const linesData: Line[] = JSON.parse(fs.readFileSync(linesPath, 'utf-8'));
            for (const line of linesData) {
                this.lines.set(line.name, line);
            }

            // routes.jsonの読み込み
            const routesPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'routes.json');
            const routesData: RouteSegment[] = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
            for (const route of routesData) {
                // 路線名と駅名のペアをソートして、常に一意なキーを作成する
                const key = this.createRouteKey(route.line, route.stations[0], route.stations[1]);
                this.routes.set(key, route);
            }

            // specificFares.jsonの読み込み
            const specificFaresPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'specificFares.json');
            this.specificFares = JSON.parse(fs.readFileSync(specificFaresPath, 'utf-8'));

            // specificSections.jsonの読み込み
            const specificSections = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'specificSections.json');
            this.specificSections = JSON.parse(fs.readFileSync(specificSections, 'utf-8'));

            // cities.jsonの読み込み
            const citiesPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'cities.json');
            this.cities = JSON.parse(fs.readFileSync(citiesPath, 'utf-8'));

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

    public getPrintedViaStringByViaString(viaString: string): string | null {
        const printedViaString = this.lines.get(viaString)?.printedName;
        if (printedViaString === undefined) {
            throw new Error(` ${printedViaString} が見つかりません.`);
        }
        else {
            return printedViaString;
        }
    }

    private createRouteKey(line: string, stationName1: string, stationName2: string): string {
        return [line, ...[stationName1, stationName2].sort()].join('-');
    }

    public getRouteSegment(line: string, stationName1: string, stationName2: string): RouteSegment {
        const key = this.createRouteKey(line, stationName1, stationName2);
        const routesSegment = this.routes.get(key);
        if (routesSegment === undefined) {
            throw new Error(` ${line}上に${stationName1}と${stationName2}間のデータが見つかりません.`);
        }
        return routesSegment;
    }

    public getSpecificFares(): SpecificFare[] {
        return this.specificFares;
    }

    public getSpecificSections(): SpecificSection[] {
        return this.specificSections;
    }

    public getCities(): City[] {
        return this.cities;
    }

    public getYamanote(): City {
        return this.yamanote;
    }
}

// シングルトンインスタンスとしてエクスポートし、アプリ全体で一つのインスタンスを共有する
export const load = new Load();