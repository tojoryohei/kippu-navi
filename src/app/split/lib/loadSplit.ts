import fs from 'fs';
import path from 'path';

class LoadSplit {
    private distancesToCityCenter: Map<string, number> = new Map();

    constructor () {
        this.loadData();
    }

    private loadData() {
        try {
            const distancesToCityCenterData = path.join(process.cwd(), 'src', 'app', 'split', 'data', 'distancesToCityCenter.json');
            const distanceToCityCenterList: { stationName: string, kilo: number }[] = JSON.parse(fs.readFileSync(distancesToCityCenterData, 'utf-8'));

            for (const distanceToCityCenter of distanceToCityCenterList) {
                this.distancesToCityCenter.set(distanceToCityCenter.stationName, distanceToCityCenter.kilo);
            }
        } catch (error) {
            console.error('データ読み込みエラー：', error);
        }
    }

    public getdistancesToCityCenter(stationName: string): number {
        return this.distancesToCityCenter.get(stationName) ?? 0;
    }
}

export const loadSplit = new LoadSplit();
