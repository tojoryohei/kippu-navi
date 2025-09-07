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
        const viaLines = this.generateViaStrings(correctedPath);
        const printedViaLines = this.generatePrintedViaStrings(viaLines);

        // 計算結果を返す
        return {
            totalEigyoKilo,
            totalGiseiKilo,
            departureStation,
            arrivalStation,
            fare,
            printedViaLines,
            validDays
        };
    }

    private createFullPath(path: PathStep[]): PathStep[] {
        if (path.length <= 1) {
            return path;
        }
        const fullPath: PathStep[] = [];
        for (let i = 0; i < path.length - 1; i++) {
            const startStep = path[i];
            const endStep = path[i + 1];
            const lineName = startStep.lineName!;
            const line = loadMR.getLineByName(lineName);
            const stationsOnLine = line.stations;
            const startIdx = stationsOnLine.indexOf(startStep.stationName);
            const endIdx = stationsOnLine.indexOf(endStep.stationName);
            let segmentStations: string[];
            if (startIdx < endIdx) {
                segmentStations = stationsOnLine.slice(startIdx, endIdx);
            } else {
                segmentStations = stationsOnLine.slice(endIdx + 1, startIdx + 1).reverse();
            }
            for (const stationName of segmentStations) {
                fullPath.push({ stationName: stationName, lineName: lineName });
            }
        }
        fullPath.push(path[path.length - 1]);
        return fullPath;
    }

    private correctPath(path: PathStep[]): PathStep[] {

        return path;
    }

    private calculateTotalEigyoKilo(path: PathStep[]): number {
        let totalEigyoKilo: number = 0;
        const fullPath: PathStep[] = this.createFullPath(path);
        for (let i = 0; i < fullPath.length - 1; i++) {
            const routeSegment: RouteSegment = loadMR.getRouteSegment(fullPath[i].stationName, fullPath[i + 1].stationName);
            totalEigyoKilo += routeSegment.eigyoKilo;
        }
        return totalEigyoKilo;
    }

    private calculateTotalGiseiKilo(path: PathStep[]): number {
        let totalGiseiKilo: number = 0;
        const fullPath: PathStep[] = this.createFullPath(path);
        for (let i = 0; i < fullPath.length - 1; i++) {
            const routeSegment: RouteSegment = loadMR.getRouteSegment(fullPath[i].stationName, fullPath[i + 1].stationName);
            totalGiseiKilo += routeSegment.giseiKilo;
        }
        return totalGiseiKilo;
    }

    private calculateFareFromKilo(GiseiKilo: number): number {
        let total: number = 0;
        return total;
    }

    private generateViaStrings(detailedPath: PathStep[]): string[] {
        let viaLines: string[] = [];
        for (const path of detailedPath) {
            if (path.lineName !== null && (viaLines.length === 0 || viaLines[viaLines.length - 1] !== path.lineName))
                viaLines.push(path.lineName);
        }
        return viaLines;
    }

    private generatePrintedViaStrings(viaStrings: string[]): string[] {
        let printViaStrings: string[] = [];
        for (const viaString of viaStrings) {
            const viaPrintedString = loadMR.getPrintedViaStringByViaString(viaString);
            if (viaPrintedString !== null) {
                printViaStrings.push(viaPrintedString);
            }
        }
        return printViaStrings;
    }

    private calculateValidDaysFromKilo(totalEigyoKilo: number): number {
        return totalEigyoKilo <= 1000 ? 1 : Math.ceil(totalEigyoKilo / 2000) + 1;
    }
}

export const calcMR = new MRCalculator();