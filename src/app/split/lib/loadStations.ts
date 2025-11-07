import fs from 'fs';
import path from 'path';

import { Station } from '@/app/types';

class LoadStations {
    private stations: Map<string, Station> = new Map();

    constructor () {
        this.loadStations();
    }

    private loadStations() {
        try {

            // stations.jsonの読み込み
            const stationPath = path.join(process.cwd(), 'src', 'app', 'mr', 'data', 'stations.json');
            const stationsData: Station[] = JSON.parse(fs.readFileSync(stationPath, 'utf-8'));
            for (const station of stationsData) {
                this.stations.set(station.name, station);
            }
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
}

export const loadStations = new LoadStations();