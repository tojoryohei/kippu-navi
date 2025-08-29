import fs from 'fs';
import path from 'path';

import { Station, Line } from "@/types";

class LoadMR {
    private stations: Map<string, Station> = new Map();
    // ... lines, routes, specialLinesなどのデータも同様に保持

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {
            const stationPath = path.join(process.cwd(), 'src', 'data', 'stations.json');
            const stationsData: Station[] = JSON.parse(fs.readFileSync(stationPath, 'utf-8'));
            for (const station of stationsData) {
                this.stations.set(station.name, station);
            }
            // ... 他のJSONファイル（lines.jsonなど）も同様に読み込む

            console.log('Data loaded successfully.');
        } catch (error) {
            console.error('Failed to load JR data:', error);
        }
    }

    // データを取得するためのメソッド群
    public getStationById(name: string): Station | undefined {
        return this.stations.get(name);
    }
    // ... 他のデータを取得するメソッド
}

export const loadMR = new LoadMR();