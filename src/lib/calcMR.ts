import { loadMR } from '@/lib/loadMR';

import { RouteRequest, ApiResponse, PathStep, RouteSegment } from '@/types';

class MRCalculator {
    public processRouteAndCalculateFare(request: RouteRequest): ApiResponse {
        const userInputPath = request.path;


        // 経路の補正
        const correctedPath = this.correctPath(userInputPath);

        // 出発駅と到着駅の名前を取得して変数に代入
        let departureStation: string = userInputPath[0].stationName;
        let arrivalStation: string = userInputPath[userInputPath.length - 1].stationName;

        // 営業キロと運賃の計算 (補正後の経路を使用)
        const totalEigyoKilo = this.calculateTotalEigyoKilo(correctedPath);
        const totalGiseiKilo = this.calculateTotalGiseiKilo(correctedPath);
        const fare = this.calculateFareFromKilo(totalGiseiKilo);
        const validDays = this.calculateValidDaysFromKilo(totalGiseiKilo);

        // 経由文字列の生成 (ユーザー入力の経路を使用)
        const viaLines = this.generateViaString(correctedPath);

        // 計算結果を返す
        return {
            totalEigyoKilo,
            totalGiseiKilo,
            departureStation,
            arrivalStation,
            fare,
            viaLines,
            validDays
        };
    }

    private createFullPath(path: PathStep[]): PathStep[] {
        const fullPath: PathStep[] = [];

        for (let i: number = 0; i < path.length; i++) {
            const line = path[i].lineName;
            if (line === null) {
                fullPath.push(path[i]);
                break;
            }
            const stationsOnLine: string[] = loadMR.getLineByName(line).stations;
            const startStationIdx: number = stationsOnLine.findIndex(stationName => stationName === path[i].stationName);
            const endStationIdx: number = stationsOnLine.findIndex(stationName => stationName === path[i + 1].stationName);
            if (startStationIdx < endStationIdx) {
                for (let j: number = startStationIdx; j < endStationIdx; j++) {
                    fullPath.push({ stationName: stationsOnLine[j], lineName: line })
                }
            } else if (startStationIdx > endStationIdx) {
                for (let j: number = endStationIdx; j < startStationIdx; j++) {
                    fullPath.push({ stationName: stationsOnLine[j], lineName: line })
                }
            }
        }
        return fullPath;
    }

    private correctPath(path: PathStep[]): PathStep[] {

        return path;
    }

    private calculateTotalEigyoKilo(path: PathStep[]): number {
        let totalEigyoKilo: number = 0;
        const fullPath: PathStep[] = this.createFullPath(path);
        for (let i = 0; i < path.length - 1; i++) {
            const routeSegment: RouteSegment = loadMR.getRouteSegment(path[i].stationName, path[i + 1].stationName);
            totalEigyoKilo += routeSegment.eigyoKilo;
        }
        return totalEigyoKilo;
    }

    private calculateTotalGiseiKilo(path: PathStep[]): number {
        let totalGiseiKilo: number = 0;
        const fullPath: PathStep[] = this.createFullPath(path);
        for (let i = 0; i < path.length - 1; i++) {
            const routeSegment: RouteSegment = loadMR.getRouteSegment(path[i].stationName, path[i + 1].stationName);
            totalGiseiKilo += routeSegment.giseiKilo;
        }
        return totalGiseiKilo;
    }

    private calculateFareFromKilo(GiseiKilo: number): number {
        let total: number = 0;
        return total;
    }

    private generateViaString(detailedPath: PathStep[]): string[] {
        let viaLines: string[] = [];
        for (const path of detailedPath) {
            if (path.lineName !== null && (viaLines.length === 0 || viaLines[viaLines.length - 1] !== path.lineName))
                viaLines.push(path.lineName);
        }
        return viaLines;
    }

    private calculateValidDaysFromKilo(totalEigyoKilo: number): number {
        return totalEigyoKilo <= 1000 ? 1 : Math.ceil(totalEigyoKilo / 2000) + 1;
    }
}

export const calcMR = new MRCalculator();