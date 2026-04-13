import fs from 'fs';
import path from 'path';

import { load } from '@/app/utils/load';
import { RouteSegment } from '@/app/types';

class LoadSplit {
    private adjacencyList: Map<string, string[]> = new Map();
    private stationPairRoutes: Map<string, RouteSegment[]> = new Map();
    private distanceToCityCenterList: { stationName: string, kilo: number }[] = [];
    private distancesToCityCenter: Map<string, number> = new Map();

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {
            const routesData = load.getRoutesList();
            for (const route of routesData) {
                const station0 = route.station0;
                const station1 = route.station1;

                // 1. 隣接リストの構築
                if (!this.adjacencyList.has(station0)) this.adjacencyList.set(station0, []);
                if (!this.adjacencyList.has(station1)) this.adjacencyList.set(station1, []);
                // 重複を避ける（厳密には不要だが安全のため）
                if (!this.adjacencyList.get(station0)!.includes(station1)) {
                    this.adjacencyList.get(station0)!.push(station1);
                }
                if (!this.adjacencyList.get(station1)!.includes(station0)) {
                    this.adjacencyList.get(station1)!.push(station0);
                }

                // 2. 駅ペア検索Mapの構築
                const pairKey = [station0, station1].sort().join('-');
                if (!this.stationPairRoutes.has(pairKey)) {
                    this.stationPairRoutes.set(pairKey, []);
                }
                this.stationPairRoutes.get(pairKey)!.push(route);

                const distancesToCityCenterData = path.join(process.cwd(), 'src', 'app', 'split', 'data', 'distancesToCityCenter.json');
                this.distanceToCityCenterList = JSON.parse(fs.readFileSync(distancesToCityCenterData, 'utf-8'));

                for (const distanceToCityCenter of this.distanceToCityCenterList) {
                    this.distancesToCityCenter.set(distanceToCityCenter.stationName, distanceToCityCenter.kilo);
                }

            }
        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getNeighbors(stationName: string): string[] {
        return this.adjacencyList.get(stationName) || [];
    }

    public getSegmentsForStationPair(stationName0: string, stationName1: string): RouteSegment[] {
        const pairKey = [stationName0, stationName1].sort().join('-');
        return this.stationPairRoutes.get(pairKey) || [];
    }

    public getdistancesToCityCenter(stationName: string): number {
        return this.distancesToCityCenter.get(stationName) ?? 0;
    }
}

export const loadSplit = new LoadSplit();
