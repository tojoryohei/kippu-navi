import { load } from '@/app/mr/lib/load';

import { RouteRequest, ApiResponse, PathStep, RouteSegment, } from '@/app/mr/types';

class Calculator {
    public processRouteAndCalculateFare(request: RouteRequest): ApiResponse {
        const userInputPath = request.path;

        // 経路の展開
        const fullPath = this.createFullPath(userInputPath);

        // 経路の補正
        const correctedPath = this.correctPath(fullPath);

        // 出発駅と到着駅の名前を取得して変数に代入
        const departureStation: string = correctedPath[0].stationName;
        const arrivalStation: string = correctedPath[correctedPath.length - 1].stationName;

        // 営業キロと運賃の計算
        const routeSegments = this.convertPathStepsToRouteSegments(correctedPath);
        const totalEigyoKilo = this.calculateTotalEigyoKilo(routeSegments);
        const totalGiseiKilo = this.calculateTotalGiseiKilo(routeSegments);
        const fare = this.calculateFareFromCorrectedPath(correctedPath);
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

    private convertPathStepsToRouteSegments(path: PathStep[]): RouteSegment[] {
        let routeSegments: RouteSegment[] = [];
        for (let i = 0; i < path.length - 1; i++) {
            const routeSegment: RouteSegment = load.getRouteSegment(path[i].stationName, path[i + 1].stationName);
            routeSegments.push(routeSegment);
        }
        return routeSegments;
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
            const line = load.getLineByName(lineName);
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

    private correctPath(fullPath: PathStep[]): PathStep[] {
        // 旅客営業規則第69条（特定区間における旅客運賃・料金計算の営業キロ又は運賃計算キロ）
        fullPath = this.correctSpecificSections(fullPath);

        // 旅客営業規則第86条（特定都区市内にある駅に関連する片道普通旅客運賃の計算方）
        fullPath = this.applyCityRule(fullPath);

        // 旅客営業規則第87条（東京山手線内にある駅に関連する片道普通旅客運賃の計算方）
        fullPath = this.applyYamanoteRule(fullPath);

        return fullPath;
    }

    private correctSpecificSections(fullPath: PathStep[]): PathStep[] {
        for (const rule of load.getSpecificSections()) {
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

    private applyCityRule(fullPath: PathStep[]): PathStep[] {
        const cities = load.getCities();
        for (const city of cities) {
            const stationsInCity = new Set(city.stations);
            const cityPath: PathStep = {
                "stationName": city.name,
                "lineName": null
            }

            // 着駅適用
            if (stationsInCity.has(fullPath[fullPath.length - 1].stationName)) {
                let changingIdx: number[] = [];
                for (let i = 0; i < fullPath.length - 1; i++) {
                    if (stationsInCity.has(fullPath[i].stationName) !== stationsInCity.has(fullPath[i + 1].stationName))
                        changingIdx.push(i);
                }
                if (changingIdx.length === 1 || changingIdx.length === 2) {
                    const applyCityRulePath = [
                        ...fullPath.slice(0, changingIdx[changingIdx.length - 1] + 1),
                        cityPath
                    ];
                    const routeSegments: RouteSegment[] = this.convertPathStepsToRouteSegments(applyCityRulePath);
                    if (this.calculateTotalEigyoKilo(routeSegments) > 2000)
                        fullPath = applyCityRulePath;
                }
            }

            // 発駅適用
            if (stationsInCity.has(fullPath[0].stationName)) {
                let changingIdx: number[] = [];
                for (let i = 0; i < fullPath.length - 1; i++) {
                    if (stationsInCity.has(fullPath[i].stationName) !== stationsInCity.has(fullPath[i + 1].stationName))
                        changingIdx.push(i);
                }
                if (changingIdx.length === 1 || changingIdx.length === 2) {
                    const applyCityRulePath = [
                        cityPath,
                        ...fullPath.slice(changingIdx[changingIdx.length - 1] + 1)
                    ];
                    const routeSegments: RouteSegment[] = this.convertPathStepsToRouteSegments(applyCityRulePath);
                    if (this.calculateTotalEigyoKilo(routeSegments) > 2000)
                        fullPath = applyCityRulePath;
                }
            }
        }
        return fullPath;
    }

    private applyYamanoteRule(fullPath: PathStep[]): PathStep[] {
        return fullPath;
    }

    private calculateTotalEigyoKilo(routeSegments: RouteSegment[]): number {
        let totalEigyoKilo: number = 0;
        for (const routeSegment of routeSegments) {
            totalEigyoKilo += routeSegment.eigyoKilo;
        }
        return totalEigyoKilo;
    }

    private calculateTotalGiseiKilo(routeSegments: RouteSegment[]): number {
        let totalGiseiKilo: number = 0;
        for (const routeSegment of routeSegments) {
            totalGiseiKilo += routeSegment.giseiKilo;
        }
        return totalGiseiKilo;
    }

    private calculateFareFromCorrectedPath(correctedPath: PathStep[]): number {
        if (correctedPath.length === 1) return 0;

        // 山手線内相互発着の場合

        // 東京附近における電車特定区間内相互発着の場合

        // 大阪附近における電車特定区間内相互発着の場合

        const allSections = new Set<string>();
        const pathsByCompany: RouteSegment[][] = [[], [], [], [], [], [], []];

        for (let i = 0; i < correctedPath.length - 1; i++) {
            const routeSegment: RouteSegment = load.getRouteSegment(correctedPath[i].stationName, correctedPath[i + 1].stationName);

            //全ての駅間の駅名を取得
            allSections.add(routeSegment.stations.sort().join('-'));

            // routeSegmentを会社ごとに分ける
            pathsByCompany[routeSegment.company].push(routeSegment);
        }

        let fare: number = 0;
        fare = this.calculateFare1(pathsByCompany[1]);

        // 第85条の2 加算普通旅客運賃の適用区間及び額
        if (allSections.has(["南千歳", "新千歳空港"].sort().join('-'))) {
            fare += 20;
        }
        if (allSections.has(["日根野", "りんくうタウン"].sort().join('-'))
            && allSections.has(["りんくうタウン", "関西空港"].sort().join('-'))) {
            fare += 220;
        } else if (allSections.has(["日根野", "りんくうタウン"].sort().join('-'))) {
            fare += 160;
        } else if (allSections.has(["りんくうタウン", "関西空港"].sort().join('-'))) {
            fare += 170;
        }
        if (allSections.has(["児島", "宇多津"].sort().join('-'))) {
            fare += 110;
        }
        if (allSections.has(["田吉", "宮崎空港"].sort().join('-'))) {
            fare += 130;
        }

        return fare;
    }

    private isAllKansen(routeSegments: RouteSegment[]): boolean {
        for (const routeSegment of routeSegments) {
            if (routeSegment.isLocal === true) return false;
        }
        return true;
    }

    private isAllLocal(routeSegments: RouteSegment[]): boolean {
        for (const routeSegment of routeSegments) {
            if (routeSegment.isLocal === false) return false;
        }
        return true;
    }

    private round10(n: number): number {
        return Math.round(n / 10) * 10;
    }

    private round100(n: number): number {
        return Math.round(n / 100) * 100;
    }

    private addTax(noTax: number): number {
        return this.round10(noTax * 1.1);
    }

    private calculateSplitKilo(totalKilo: number): number {
        if (10 < totalKilo && totalKilo <= 50) return Math.floor((totalKilo - 1) / 5) * 5 + 3;
        if (50 < totalKilo && totalKilo <= 100) return Math.floor((totalKilo - 1) / 10) * 10 + 5;
        if (100 < totalKilo && totalKilo <= 600) return Math.floor((totalKilo - 1) / 20) * 20 + 10;
        if (600 < totalKilo) return Math.floor((totalKilo - 1) / 40) * 40 + 20;
        throw new Error(`calculateSplitKiloでエラーが発生しました.`);
    }

    private calculateFare1(routeSegments: RouteSegment[]): number {
        const totalEigyoKilo: number = Math.ceil(this.calculateTotalEigyoKilo(routeSegments) / 10);

        // 第84条の2 北海道旅客鉄道会社線内の営業キロが10キロメートルまでの片道普通旅客運賃
        if (totalEigyoKilo <= 10) {

            // （1）幹線内相互発着の場合
            if (this.isAllKansen(routeSegments)) {
                if (totalEigyoKilo <= 3) return 210;
                if (totalEigyoKilo <= 6) return 270;
                return 310;
            }

            // （2）地方交通線内相互発着の場合及び幹線と地方交通線を連続して乗車する場合
            else {
                if (totalEigyoKilo <= 3) return 210;
                if (totalEigyoKilo <= 6) return 270;
                return 320;
            }
        }

        // 第77条の2 北海道旅客鉄道会社内の幹線内相互発着の大人片道普通旅客運賃
        if (this.isAllKansen(routeSegments)) {

            // （1）営業キロが11キロメートルから100キロメートルまでの場合
            if (totalEigyoKilo <= 15) return 360;
            if (totalEigyoKilo <= 20) return 470;
            if (totalEigyoKilo <= 25) return 580;
            if (totalEigyoKilo <= 30) return 680;
            if (totalEigyoKilo <= 35) return 800;
            if (totalEigyoKilo <= 40) return 920;
            if (totalEigyoKilo <= 45) return 1040;
            if (totalEigyoKilo <= 50) return 1210;
            if (totalEigyoKilo <= 60) return 1380;
            if (totalEigyoKilo <= 70) return 1590;
            if (totalEigyoKilo <= 80) return 1800;
            if (totalEigyoKilo <= 90) return 2020;
            if (totalEigyoKilo <= 100) return 2240;

            // （2）営業キロが100キロメートルを超える場合
            const splitKilo = this.calculateSplitKilo(totalEigyoKilo);
            if (totalEigyoKilo <= 200) return this.addTax(this.round100(splitKilo * 21.16));
            if (totalEigyoKilo <= 300) return this.addTax(this.round100(200 * 21.16 + (splitKilo - 200) * 16.36));
            if (totalEigyoKilo <= 600) return this.addTax(this.round100(200 * 21.16 + 100 * 16.36 + (splitKilo - 300) * 12.83));
            else return this.addTax(this.round100(200 * 21.16 + 100 * 16.36 + 300 * 12.83 + (splitKilo - 600) * 7.05));
        }

        // 北海道旅客鉄道会社内の地方交通線内相互発着の大人片道普通旅客運賃
        if (this.isAllLocal(routeSegments)) {

            // 第77条の6（1）営業キロが11キロメートルから100キロメートルまでの場合
            if (totalEigyoKilo <= 15) return 360;
            if (totalEigyoKilo <= 20) return 470;
            if (totalEigyoKilo <= 23) return 580;
            if (totalEigyoKilo <= 28) return 680;
            if (totalEigyoKilo <= 32) return 800;
            if (totalEigyoKilo <= 37) return 920;
            if (totalEigyoKilo <= 41) return 1040;
            if (totalEigyoKilo <= 46) return 1210;
            if (totalEigyoKilo <= 55) return 1380;
            if (totalEigyoKilo <= 64) return 1590;
            if (totalEigyoKilo <= 73) return 1800;
            if (totalEigyoKilo <= 82) return 2020;
            if (totalEigyoKilo <= 91) return 2240;
            if (totalEigyoKilo <= 100) return 2480;

            // 第77条の6（2）営業キロが100キロメートルを超える場合
            if (totalEigyoKilo <= 110) return 2530;
            if (totalEigyoKilo <= 128) return 3080;
            if (totalEigyoKilo <= 146) return 3520;
            if (totalEigyoKilo <= 164) return 3960;
            if (totalEigyoKilo <= 182) return 4400;
            if (totalEigyoKilo <= 200) return 4840;
            if (totalEigyoKilo <= 219) return 5170;
            if (totalEigyoKilo <= 237) return 5610;
            if (totalEigyoKilo <= 255) return 5940;
            if (totalEigyoKilo <= 273) return 6270;
            if (totalEigyoKilo <= 291) return 6600;
            if (totalEigyoKilo <= 310) return 6820;
            if (totalEigyoKilo <= 328) return 7150;
            if (totalEigyoKilo <= 346) return 7480;
            if (totalEigyoKilo <= 364) return 7700;
            if (totalEigyoKilo <= 382) return 8030;
            if (totalEigyoKilo <= 400) return 8250;
            if (totalEigyoKilo <= 419) return 8580;
            if (totalEigyoKilo <= 437) return 8800;
            if (totalEigyoKilo <= 455) return 9130;
            if (totalEigyoKilo <= 473) return 9460;
            if (totalEigyoKilo <= 491) return 9680;
            if (totalEigyoKilo <= 510) return 10010;
            if (totalEigyoKilo <= 528) return 10230;
            if (totalEigyoKilo <= 546) return 10560;
            if (totalEigyoKilo <= 582) return 10780;
            if (totalEigyoKilo <= 619) return 11110;
            if (totalEigyoKilo <= 655) return 11440;
            if (totalEigyoKilo <= 691) return 11770;
        }

        // 第81条の2 北海道旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人片道普通旅客運賃
        if (this.isAllKansen(routeSegments) === false && this.isAllLocal(routeSegments) === false) {
            const totalGiseiKilo: number = Math.ceil(this.calculateTotalGiseiKilo(routeSegments) / 10);

            // （1）営業キロが11キロメートルから100キロメートルまでの場合

            if (totalGiseiKilo <= 15) return 360;
            if (totalGiseiKilo <= 20) return 470;
            if (totalGiseiKilo <= 25) return 580;
            if (totalGiseiKilo <= 30) return 680;
            if (totalGiseiKilo <= 35) return 800;
            if (totalGiseiKilo <= 40) return 920;
            if (totalGiseiKilo <= 45) return 1040;
            if (totalGiseiKilo <= 50) return 1210;
            if (totalGiseiKilo <= 60) return 1380;
            if (totalGiseiKilo <= 70) return 1590;
            if (totalGiseiKilo <= 80) return 1800;
            if (totalGiseiKilo <= 90) return 2020;
            if (totalGiseiKilo <= 100) return 2240;

            // （2）営業キロが100キロメートルを超える場合
            const splitKilo = this.calculateSplitKilo(totalGiseiKilo);
            if (totalGiseiKilo <= 200) return this.addTax(this.round100(splitKilo * 21.16));
            if (totalGiseiKilo <= 300) return this.addTax(this.round100(200 * 21.16 + (splitKilo - 200) * 16.36));
            if (totalGiseiKilo <= 600) return this.addTax(this.round100(200 * 21.16 + 100 * 16.36 + (splitKilo - 300) * 12.83));
            else return this.addTax(this.round100(200 * 21.16 + 100 * 16.36 + 300 * 12.83 + (splitKilo - 600) * 7.05));
        }

        throw new Error(`calculateFare1でエラーが発生しました.`);

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
            const viaPrintedString = load.getPrintedViaStringByViaString(viaString);
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

export const calc = new Calculator();