import { loadMR } from '@/lib/loadMR';

import { RouteRequest, ApiResponse, PathStep, RouteSegment } from '@/types';

class MRCalculator {
    public processRouteAndCalculateFare(request: RouteRequest): ApiResponse {
        const userInputPath = request.path;

        // 経路の展開
        const fullPath = this.createFullPath(userInputPath);
        console.log(fullPath);
        // 経路の補正
        const correctedPath = this.correctPath(fullPath);
        console.log(correctedPath);
        // 出発駅と到着駅の名前を取得して変数に代入
        const departureStation: string = correctedPath[0].stationName;
        const arrivalStation: string = correctedPath[correctedPath.length - 1].stationName;

        // 営業キロと運賃の計算
        const totalEigyoKilo = this.calculateTotalEigyoKilo(correctedPath);
        const totalGiseiKilo = this.calculateTotalGiseiKilo(correctedPath);
        const fare = this.calculateFareFromKilo(totalGiseiKilo);
        const validDays = this.calculateValidDaysFromKilo(totalEigyoKilo);

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
        let correctedPath = path;

        // 旅客営業規則第69条
        correctedPath = this.correctSpecificSections(correctedPath);


        correctedPath = this.applyCityZoneRules(correctedPath);
        return correctedPath;
    }

    private correctSpecificSections(fullPath: PathStep[]): PathStep[] {
        for (const rule of loadMR.getSpecificSections()) {
            const fullPathStations = fullPath.map(p => p.stationName);
            const straddling = rule.correctPath
                .slice(1)
                .some(path => fullPathStations.includes(path.stationName));

            const startIndex = this.findSubPathIndex(fullPathStations, rule.incorrectPath);

            if (straddling === false && startIndex !== -1) {
                const correctPath = rule.correctPath;
                const correctedPath = [
                    ...fullPath.slice(0, startIndex),
                    ...correctPath,
                    ...fullPath.slice(startIndex + rule.incorrectPath.length - 1)
                ];
                return correctedPath;
            }
        }
        return fullPath;
    }

    private findSubPathIndex(path: string[], subPath: string[]): number {
        if (subPath.length > path.length) return -1;
        for (let i = 0; i <= path.length - subPath.length; i++) {
            let match = true;
            for (let j = 0; j < subPath.length; j++) {
                if (path[i + j] !== subPath[j]) {
                    match = false;
                    break;
                }
            }
            if (match) return i;
        }
        return -1;
    }

    private applyCityZoneRules(path: PathStep[]): PathStep[] {
        const totalGiseiKilo: number = this.calculateTotalGiseiKilo(path);
        const startStation = path[0];
        const endStation = path[path.length - 1];

        const startZone = loadMR.findZoneForStation(startStation.stationName);
        const endZone = loadMR.findZoneForStation(endStation.stationName);

        // 到着駅の判定
        if (endZone && totalGiseiKilo >= endZone.distanceThreshold && !endZone.stations.includes(startStation.stationName)) {
            const doesReEnter = path.slice(0, -1).some(p => endZone.stations.includes(p.stationName));
            if (!doesReEnter) {
                console.log(`到着駅に「${endZone.name}」を適用`);
                const newPath = [...path];
                newPath[newPath.length - 1] = { stationName: endZone.centerStation, lineName: null };
            }
        }

        // 出発駅の判定
        if (startZone && totalGiseiKilo >= startZone.distanceThreshold && !startZone.stations.includes(endStation.stationName)) {
            // 途中でゾーンに再突入していないかチェック
            const doesReEnter = path.slice(1).some(p => startZone.stations.includes(p.stationName));
            if (!doesReEnter) {
                console.log(`出発駅に「${startZone.name}」を適用`);
                // 経路の始点を中心駅に書き換える（運賃計算用）
                const newPath = [...path];
                newPath[0] = { stationName: startZone.centerStation, lineName: startStation.lineName };
            }
        }

        return path;
    }

    private calculateTotalEigyoKilo(path: PathStep[]): number {
        let totalEigyoKilo: number = 0;
        for (let i = 0; i < path.length - 1; i++) {
            const routeSegment: RouteSegment = loadMR.getRouteSegment(path[i].stationName, path[i + 1].stationName);
            totalEigyoKilo += routeSegment.eigyoKilo;
        }
        return totalEigyoKilo;
    }

    private calculateTotalGiseiKilo(path: PathStep[]): number {
        let totalGiseiKilo: number = 0;
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