import fs from 'fs';
import path from 'path';
import { Station, Line, RouteSegment } from '@/types';

class LoadMR {
    private stations: Map<string, Station> = new Map();
    private lines: Map<string, Line> = new Map();
    private routes: Map<string, RouteSegment> = new Map();

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {
            // stations.jsonの読み込み
            const stationPath = path.join(process.cwd(), 'src', 'data', 'stations.json');
            const stationsData: Station[] = JSON.parse(fs.readFileSync(stationPath, 'utf-8'));
            for (const station of stationsData) {
                this.stations.set(station.name, station);
            }

            // lines.jsonの読み込み
            const linesPath = path.join(process.cwd(), 'src', 'data', 'lines.json');
            const linesData: Line[] = JSON.parse(fs.readFileSync(linesPath, 'utf-8'));
            for (const line of linesData) {
                this.lines.set(line.name, line);
            }

            // routes.jsonの読み込み
            const routesPath = path.join(process.cwd(), 'src', 'data', 'routes.json');
            const routesData: RouteSegment[] = JSON.parse(fs.readFileSync(routesPath, 'utf-8'));
            for (const route of routesData) {
                // ★ 駅名のペアをソートして、常に一意なキーを作成する
                const key = this.createRouteKey(route.stations[0], route.stations[1]);
                this.routes.set(key, route);
            }

        } catch (error) {
            console.error('Failed to load JR data:', error);
        }
    }

    // --- 他のサービスからデータを取得するための公開メソッド ---

    public getStationByName(name: string): Station | undefined {
        return this.stations.get(name);
    }

    public getLineByName(name: string): Line | undefined {
        return this.lines.get(name);
    }

    private createRouteKey(stationName1: string, stationName2: string): string {
        return [stationName1, stationName2].sort().join('-');
    }

    public getRouteSegment(stationName1: string, stationName2: string): RouteSegment | undefined {
        const key = this.createRouteKey(stationName1, stationName2);
        return this.routes.get(key);
    }
}

// シングルトンインスタンスとしてエクスポートし、アプリ全体で一つのインスタンスを共有する
export const loadMR = new LoadMR();