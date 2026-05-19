import { StationData } from '@/app/types';
import { calculateDistanceKm } from '@/app/utils/calc';
import fs from 'fs';
import path from 'path';

class LoadSplit {
    private distancesToCityCenter: Map<string, number> = new Map();
    private stations: Set<string> = new Set();
    private stationLocations: Map<string, { lat: number, lon: number }> = new Map();

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {
            const distancesToCityCenterData = path.join(process.cwd(), 'src', 'app', 'split', 'data', 'distancesToCityCenter.json');
            const distanceToCityCenterList: { stationName: string, kilo: number }[] = JSON.parse(fs.readFileSync(distancesToCityCenterData, 'utf-8'));

            const stations = path.join(process.cwd(), 'src', 'app', 'split', 'data', 'stationDatas.json');
            const stationsList: StationData[] = JSON.parse(fs.readFileSync(stations, 'utf-8'));

            for (const distanceToCityCenter of distanceToCityCenterList) {
                this.distancesToCityCenter.set(distanceToCityCenter.stationName, distanceToCityCenter.kilo);
            }

            for (const station of stationsList) {
                this.stationLocations.set(station.name, { lat: station.lat, lon: station.lon });
            }
        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getdistanceToCityCenter(stationName: string): number {
        return this.distancesToCityCenter.get(stationName) ?? 0;
    }

    public getDistanceBetween(stationName0: string, stationName1: string): number {
        const station0 = this.stationLocations.get(stationName0);
        const station1 = this.stationLocations.get(stationName1);
        if (station0 === undefined || station1 === undefined) throw new Error("loadSplit.tsで駅名が見つかりませんでした。");
        const lat0: number = station0.lat;
        const lon0: number = station0.lon;
        const lat1: number = station1.lat;
        const lon1: number = station1.lon;
        return calculateDistanceKm(lat0, lon0, lat1, lon1);
    }

    public getStations(): Set<string> {
        return this.stations;
    }

    public hasStation(stationName: string): boolean {
        return this.stations.has(stationName);
    }
}

export const loadSplit = new LoadSplit();
