import { load } from '@/app/me/lib/load';

import { RouteRequest, ApiResponse, PathStep, RouteSegment, TrainSpecificSection } from '@/app/me/types';

class Calculator {
    public processRouteAndCalculateFare(request: RouteRequest): ApiResponse {
        const userInputPath = request.path;

        // 経路の展開
        const fullPath = this.createFullPath(userInputPath);

        // 経路の補正
        const correctedPath = this.correctPath(fullPath);

        // 出発駅と到着駅の名前を取得して変数に代入
        const departureStation = correctedPath[0].stationName;
        const arrivalStation = correctedPath[correctedPath.length - 1].stationName;

        // 営業キロと運賃の計算
        const routeSegments = this.convertPathStepsToRouteSegments(correctedPath);
        const totalEigyoKilo = this.calculateTotalEigyoKilo(routeSegments);
        const totalGiseiKilo = this.calculateTotalGiseiKilo(routeSegments);
        const fare = this.calculateFareFromCorrectedPath(correctedPath)
            + this.calculateBarrierFreeFeeFromCorrectedPath(correctedPath);
        const validDays = this.calculateValidDaysFromKilo(totalEigyoKilo);

        // 経由文字列の生成 (ユーザー入力の経路を使用)
        const viaLines = this.generateViaStrings(correctedPath);
        const printedViaLines = this.generatePrintedViaStrings(viaLines);

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

        // 第69条 特定区間における旅客運賃・料金計算の営業キロ又は運賃計算キロ
        // fullPath = this.correctSpecificSections(fullPath);

        // 第70条 旅客が次に掲げる図の太線区間を通過する場合

        // 第86条 特定都区市内にある駅に関連する片道普通旅客運賃の計算方
        fullPath = this.applyCityRule(fullPath);

        // 第87条 東京山手線内にある駅に関連する片道普通旅客運賃の計算方
        fullPath = this.applyYamanoteRule(fullPath);

        return fullPath;
    }

    private correctSpecificSections(fullPath: PathStep[]): PathStep[] {
        for (const rule of load.getSpecificSections()) {
            const { incorrectPath, correctPath } = rule;

            const startIndex = this.findSubPathIndex(fullPath, incorrectPath);

            if (startIndex !== -1) {
                const correctPathMiddleStations = correctPath.slice(1, -1).map(p => p.stationName);
                const pathOutsideSegment = [
                    ...fullPath.slice(0, startIndex),
                    ...fullPath.slice(startIndex + incorrectPath.length)
                ];

                const isStraddling = correctPathMiddleStations.some(
                    correctStation => pathOutsideSegment.some(p => p.stationName === correctStation)
                );

                if (!isStraddling) {
                    const correctedPath = [
                        ...fullPath.slice(0, startIndex),
                        ...correctPath,
                        ...fullPath.slice(startIndex + incorrectPath.length)
                    ];
                    fullPath = correctedPath;
                }
            }
        }

        return fullPath;
    }

    private findSubPathIndex(path: PathStep[], subPath: PathStep[]): number {
        if (subPath.length === 0 || subPath.length > path.length) return -1;

        for (let i = 0; i <= path.length - subPath.length; i++) {
            let match = true;
            for (let j = 0; j < subPath.length; j++) {
                if (path[i + j].stationName !== subPath[j].stationName) {
                    match = false;
                    break;
                }
            }
            if (match) return i;
        }
        return -1;
    }

    // 第86条 特定都区市内にある駅に関連する片道普通旅客運賃の計算方
    private applyCityRule(fullPath: PathStep[]): PathStep[] {
        const cities = load.getCities();
        const threshold: number = 2000;

        for (const city of cities) {
            const stationsInCity = new Set(city.stations);

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
                        {
                            "stationName": city.name,
                            "lineName": null
                        }
                    ];
                    const routeSegments: RouteSegment[] = this.convertPathStepsToRouteSegments(applyCityRulePath);
                    if (this.calculateTotalEigyoKilo(routeSegments) > threshold)
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
                        { "stationName": city.name, "lineName": fullPath[changingIdx[changingIdx.length - 1]].lineName },
                        ...fullPath.slice(changingIdx[changingIdx.length - 1] + 1)
                    ];
                    const routeSegments: RouteSegment[] = this.convertPathStepsToRouteSegments(applyCityRulePath);
                    if (this.calculateTotalEigyoKilo(routeSegments) > threshold)
                        fullPath = applyCityRulePath;
                }
            }
        }
        return fullPath;
    }

    // 第87条 東京山手線内にある駅に関連する片道普通旅客運賃の計算方
    private applyYamanoteRule(fullPath: PathStep[]): PathStep[] {
        const yamanote = load.getYamanote();
        const stationsInYamanote = new Set(yamanote.stations);
        const threshold: number = 1000;

        // 着駅適用
        if (stationsInYamanote.has(fullPath[fullPath.length - 1].stationName)) {
            let changingIdx: number[] = [];
            for (let i = 0; i < fullPath.length - 1; i++) {
                if (stationsInYamanote.has(fullPath[i].stationName) !== stationsInYamanote.has(fullPath[i + 1].stationName))
                    changingIdx.push(i);
            }
            if (changingIdx.length === 1 || changingIdx.length === 2) {
                const applyCityRulePath = [
                    ...fullPath.slice(0, changingIdx[changingIdx.length - 1] + 1),
                    { "stationName": yamanote.name, "lineName": null }
                ];
                const routeSegments: RouteSegment[] = this.convertPathStepsToRouteSegments(applyCityRulePath);
                if (this.calculateTotalEigyoKilo(routeSegments) > threshold)
                    fullPath = applyCityRulePath;
            }
        }

        // 発駅適用
        if (stationsInYamanote.has(fullPath[0].stationName)) {
            let changingIdx: number[] = [];
            for (let i = 0; i < fullPath.length - 1; i++) {
                if (stationsInYamanote.has(fullPath[i].stationName) !== stationsInYamanote.has(fullPath[i + 1].stationName))
                    changingIdx.push(i);
            }
            if (changingIdx.length === 1 || changingIdx.length === 2) {
                const applyCityRulePath = [
                    { "stationName": yamanote.name, "lineName": fullPath[changingIdx[0]].lineName },
                    ...fullPath.slice(changingIdx[0] + 1)
                ];
                const routeSegments: RouteSegment[] = this.convertPathStepsToRouteSegments(applyCityRulePath);
                if (this.calculateTotalEigyoKilo(routeSegments) > threshold)
                    fullPath = applyCityRulePath;
            }
        }
        return fullPath;
    }

    private convertPathStepsToRouteSegments(path: PathStep[]): RouteSegment[] {
        let routeSegments: RouteSegment[] = [];
        for (let i = 0; i < path.length - 1; i++) {
            const line = path[i].lineName;
            if (line === null) continue;
            const routeSegment: RouteSegment = load.getRouteSegment(line, path[i].stationName, path[i + 1].stationName);
            routeSegments.push(routeSegment);
        }
        return routeSegments;
    }

    private convertPathStepsToRouteKeys(path: PathStep[]): string[] {
        let routeKeys: string[] = [];
        for (let i = 0; i < path.length - 1; i++) {
            const line = path[i].lineName;
            if (line === null) continue;
            const routeKey: string = load.createRouteKey(line, path[i].stationName, path[i + 1].stationName);
            routeKeys.push(routeKey);
        }
        return routeKeys;
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

        // 第79条 東京附近等の特定区間等における大人片道普通旅客運賃の特定
        const specificFares = load.getSpecificFares();
        for (const specificFare of specificFares) {
            if (JSON.stringify(correctedPath) === JSON.stringify(specificFare.sections)) {
                return specificFare.fare;
            }
        }

        const routeKeys = new Set<string>();
        const routeSegments: RouteSegment[] = [];
        const routeSegmentsByCompany: RouteSegment[][] = [[], [], [], [], [], [], []];
        // 0 = その他, 1 = JR北海道, 2 = JR東日本, 3 = JR東海, 4 = JR西日本, 5 = JR四国, 6 = JR九州

        for (let i = 0; i < correctedPath.length - 1; i++) {
            const line = correctedPath[i].lineName;
            if (line === null) throw new Error(`calculateFareFromCorrectedPathでエラーが発生しました.`);
            const routeSegment = load.getRouteSegment(line, correctedPath[i].stationName, correctedPath[i + 1].stationName);

            // 全ての駅間の駅名を取得
            routeKeys.add(load.createRouteKey(line, routeSegment.station0, routeSegment.station1));
            routeSegments.push(routeSegment);

            // routeSegmentを会社ごとに分ける
            routeSegmentsByCompany[routeSegment.company].push(routeSegment);
        }

        // 第78条 電車特定区間内等の大人片道普通旅客運賃
        // （1） 山手線内の駅相互発着の場合
        if (this.isAllTrainSpecificSections("山手線内", [...routeKeys])) {
            return this.calculateFareInYamanote(routeSegments);
        }
        // （2） イ 東京附近における電車特定区間内相互発着の場合
        if (this.isAllTrainSpecificSections("東京附近", [...routeKeys])) {
            return this.calculateFareInTokyo(routeSegments);
        }
        // （2） ロ 大阪附近における電車特定区間内相互発着の場合
        if (this.isAllTrainSpecificSections("大阪附近", [...routeKeys])) {
            return this.calculateFareInOsaka(routeSegments);
        }

        // 第85条 他の旅客鉄道会社線を連続して乗車する場合の大人片道普通旅客運賃
        let fare: number = this.calculateFare(routeSegments);

        // （1）北海道旅客鉄道会社線の乗車区間に対する普通旅客運賃の加算額
        if (0 < routeSegmentsByCompany[1].length) {
            fare += this.calculateFare1(routeSegmentsByCompany[1]) - this.calculateFare(routeSegmentsByCompany[1]);
        }

        // （2）四国旅客鉄道会社線の乗車区間に対する普通旅客運賃の加算額
        if (0 < routeSegmentsByCompany[5].length) {
            fare += this.calculateFare5(routeSegmentsByCompany[5]) - this.calculateFare(routeSegmentsByCompany[5]);
        }

        // （3）九州旅客鉄道会社線の乗車区間に対する普通旅客運賃の加算額
        if (0 < routeSegmentsByCompany[6].length) {
            fare += this.calculateFare6(routeSegmentsByCompany[6]) - this.calculateFare(routeSegmentsByCompany[6]);
        }

        // 第85条の２ 加算普通旅客運賃の適用区間及び額
        if (routeKeys.has(load.createRouteKey("千歳支線", "南千歳", "新千歳空港"))) {
            fare += 20;
        }
        if (routeKeys.has(load.createRouteKey("関西空港線", "日根野", "りんくうタウン"))
            && routeKeys.has(load.createRouteKey("関西空港線", "りんくうタウン", "関西空港"))) {
            fare += 220;
        } else if (routeKeys.has(load.createRouteKey("関西空港線", "日根野", "りんくうタウン"))) {
            fare += 160;
        } else if (routeKeys.has(load.createRouteKey("関西空港線", "りんくうタウン", "関西空港"))) {
            fare += 170;
        }
        if (routeKeys.has(load.createRouteKey("本四備讃", "児島", "宇多津"))) {
            fare += 110;
        }
        if (routeKeys.has(load.createRouteKey("宮崎空港線", "田吉", "宮崎空港"))) {
            fare += 130;
        }

        return fare;
    }

    private isAllTrainSpecificSections(specificSectionName: keyof TrainSpecificSection, routeKeys: string[]): boolean {
        const trainSpecificSection = load.getTrainSpecificSections(specificSectionName);
        for (const routeKey of routeKeys) {
            if (routeKey in trainSpecificSection === false) return false;
        }
        return true;
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

    private floor10(n: number): number {
        return Math.floor(n / 10) * 10;
    }

    private ceil10(n: number): number {
        return Math.ceil(n / 10) * 10;
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

    private calculateSplitKiloOfKansen(totalKilo: number): number {
        if (10 < totalKilo && totalKilo <= 50) return Math.floor((totalKilo - 1) / 5) * 5 + 3;
        if (50 < totalKilo && totalKilo <= 100) return Math.floor((totalKilo - 1) / 10) * 10 + 5;
        if (100 < totalKilo && totalKilo <= 600) return Math.floor((totalKilo - 1) / 20) * 20 + 10;
        if (600 < totalKilo) return Math.floor((totalKilo - 1) / 40) * 40 + 20;
        throw new Error(`calculateSplitKiloOfKansenでエラーが発生しました.`);
    }

    // 別表第２号イの４ 地方交通線の営業キロの区間
    private calculateSplitKiloOfLocal(totalKilo: number): number {
        if (totalKilo <= 10) throw new Error(`calculateSplitKiloOfLocalで範囲外アクセスが発生しました.`);
        if (totalKilo <= 15) return 13;
        if (totalKilo <= 20) return 18;
        if (totalKilo <= 23) return 22;
        if (totalKilo <= 28) return 26;
        if (totalKilo <= 32) return 30;
        if (totalKilo <= 37) return 35;
        if (totalKilo <= 41) return 39;
        if (totalKilo <= 46) return 44;
        if (totalKilo <= 55) return 51;
        if (totalKilo <= 64) return 60;
        if (totalKilo <= 73) return 69;
        if (totalKilo <= 82) return 78;
        if (totalKilo <= 91) return 87;
        if (totalKilo <= 100) return 96;
        if (totalKilo <= 110) return 105;
        if (totalKilo <= 128) return 119;
        if (totalKilo <= 146) return 137;
        if (totalKilo <= 164) return 155;
        if (totalKilo <= 182) return 173;
        if (totalKilo <= 200) return 191;
        if (totalKilo <= 219) return 210;
        if (totalKilo <= 237) return 228;
        if (totalKilo <= 255) return 246;
        if (totalKilo <= 273) return 264;
        if (totalKilo <= 291) return 282;
        if (totalKilo <= 310) return 301;
        if (totalKilo <= 328) return 319;
        if (totalKilo <= 346) return 337;
        if (totalKilo <= 364) return 355;
        if (totalKilo <= 382) return 373;
        if (totalKilo <= 400) return 391;
        if (totalKilo <= 419) return 410;
        if (totalKilo <= 437) return 428;
        if (totalKilo <= 455) return 446;
        if (totalKilo <= 473) return 464;
        if (totalKilo <= 491) return 482;
        if (totalKilo <= 510) return 501;
        if (totalKilo <= 528) return 519;
        if (totalKilo <= 546) return 537;
        if (totalKilo <= 582) return 564;
        if (totalKilo <= 619) return 601;
        if (totalKilo <= 655) return 637;
        if (totalKilo <= 691) return 673;
        if (totalKilo <= 728) return 710;
        if (totalKilo <= 764) return 746;
        if (totalKilo <= 800) return 782;
        if (totalKilo <= 837) return 819;
        if (totalKilo <= 873) return 855;
        if (totalKilo <= 910) return 892;
        if (totalKilo <= 946) return 928;
        if (totalKilo <= 982) return 964;
        if (totalKilo <= 1019) return 1001;
        if (totalKilo <= 1055) return 1037;
        if (totalKilo <= 1091) return 1073;
        if (totalKilo <= 1128) return 1110;
        if (totalKilo <= 1164) return 1146;
        if (totalKilo <= 1200) return 1182;
        throw new Error(`calculateSplitKiloOfLocalで範囲外アクセスが発生しました.`);
    }

    private calculateFare(routeSegments: RouteSegment[]): number {
        const totalEigyoKilo: number = Math.ceil(this.calculateTotalEigyoKilo(routeSegments) / 10);

        // 第84条 営業キロが10キロメートルまでの片道普通旅客運賃
        // （1）幹線内相互発着の場合
        if (this.isAllKansen(routeSegments)) {
            if (totalEigyoKilo <= 3) return 150;
            if (totalEigyoKilo <= 6) return 190;
            if (totalEigyoKilo <= 10) return 200;
        }

        // （3）地方交通線内相互発着の場合及び幹線と地方交通線を連続して乗車する場合
        else {
            if (totalEigyoKilo <= 3) return 150;
            if (totalEigyoKilo <= 6) return 190;
            if (totalEigyoKilo <= 10) return 210;
        }

        // 第77条 幹線内相互発着の大人片道普通旅客運賃
        if (this.isAllKansen(routeSegments)) {
            const splitKilo = this.calculateSplitKiloOfKansen(totalEigyoKilo);
            if (totalEigyoKilo <= 100) return this.addTax(this.ceil10(16.20 * splitKilo));
            if (totalEigyoKilo <= 300) return this.addTax(this.round100(16.20 * splitKilo));
            if (totalEigyoKilo <= 600) return this.addTax(this.round100(16.20 * 300 + 12.85 * (splitKilo - 300)));
            return this.addTax(this.round100(16.20 * 300 + 12.85 * 300 + 7.05 * (splitKilo - 600)));
        }

        // 第77条の５ 地方交通線内相互発着の大人片道普通旅客運賃
        if (this.isAllLocal(routeSegments)) {
            if (11 <= totalEigyoKilo && totalEigyoKilo <= 15) return 240;
            if (16 <= totalEigyoKilo && totalEigyoKilo <= 20) return 330;
            if (21 <= totalEigyoKilo && totalEigyoKilo <= 23) return 420;
            if (24 <= totalEigyoKilo && totalEigyoKilo <= 28) return 510;
            if (33 <= totalEigyoKilo && totalEigyoKilo <= 37) return 680;
            if (42 <= totalEigyoKilo && totalEigyoKilo <= 46) return 860;
            if (47 <= totalEigyoKilo && totalEigyoKilo <= 55) return 990;
            if (56 <= totalEigyoKilo && totalEigyoKilo <= 64) return 1170;
            if (65 <= totalEigyoKilo && totalEigyoKilo <= 73) return 1340;
            if (74 <= totalEigyoKilo && totalEigyoKilo <= 82) return 1520;
            if (83 <= totalEigyoKilo && totalEigyoKilo <= 91) return 1690;
            if (101 <= totalEigyoKilo && totalEigyoKilo <= 110) return 1980;
            if (292 <= totalEigyoKilo && totalEigyoKilo <= 310) return 5720;

            const splitKilo = this.calculateSplitKiloOfKansen(totalEigyoKilo);
            if (totalEigyoKilo <= 273) return this.addTax(this.round100(17.80 * splitKilo));
            if (totalEigyoKilo <= 546) return this.addTax(this.round100(17.80 * 273 + 14.10 * (splitKilo - 273)));
            return this.addTax(this.round100(17.80 * 273 + 14.10 * 273 + 7.70 * (splitKilo - 546)));
        }

        // 第81条 幹線と地方交通線を連続して乗車する場合の大人片道普通旅客運賃
        const totalGiseiKilo: number = Math.ceil(this.calculateTotalGiseiKilo(routeSegments) / 10);
        const splitKilo = this.calculateSplitKiloOfKansen(totalGiseiKilo);
        if (totalGiseiKilo <= 100) return this.addTax(this.ceil10(16.20 * splitKilo));
        if (totalGiseiKilo <= 300) return this.addTax(this.round100(16.20 * splitKilo));
        if (totalGiseiKilo <= 600) return this.addTax(this.round100(16.20 * 300 + 12.85 * (splitKilo - 300)));
        return this.addTax(this.round100(16.20 * 300 + 12.85 * 300 + 7.05 * (splitKilo - 600)));
    }

    private calculateFareInYamanote(routeSegments: RouteSegment[]): number {
        const totalEigyoKilo: number = Math.ceil(this.calculateTotalEigyoKilo(routeSegments) / 10);

        // 第84条 営業キロが10キロメートルまでの片道普通旅客運賃
        if (totalEigyoKilo <= 3) return 140;
        if (totalEigyoKilo <= 6) return 160;
        if (totalEigyoKilo <= 10) return 170;

        const splitKilo: number = this.calculateSplitKiloOfKansen(totalEigyoKilo);
        if (totalEigyoKilo <= 100) return this.floor10(this.ceil10(13.25 * splitKilo) * 1.1);
        if (totalEigyoKilo <= 300) return this.floor10(this.round100(13.25 * splitKilo) * 1.1);

        throw new Error(`calculateFareInYamanoteで範囲外アクセスが発生しました.`);
    }

    private calculateFareInTokyo(routeSegments: RouteSegment[]): number {
        const totalEigyoKilo: number = Math.ceil(this.calculateTotalEigyoKilo(routeSegments) / 10);

        // 第84条 営業キロが10キロメートルまでの片道普通旅客運賃
        if (totalEigyoKilo <= 3) return 140;
        if (totalEigyoKilo <= 6) return 160;
        if (totalEigyoKilo <= 10) return 170;

        const splitKilo: number = this.calculateSplitKiloOfKansen(totalEigyoKilo);
        if (totalEigyoKilo <= 100) return this.floor10(this.ceil10(15.30 * splitKilo) * 1.1);
        if (totalEigyoKilo <= 300) return this.floor10(this.round100(15.30 * splitKilo) * 1.1);
        if (totalEigyoKilo <= 600) return this.floor10(this.round100(15.30 * 300 + 12.15 * (splitKilo - 300) * 1.1));

        throw new Error(`calculateFareInTokyoで範囲外アクセスが発生しました.`);
    }

    private calculateFareInOsaka(routeSegments: RouteSegment[]): number {
        const totalEigyoKilo: number = Math.ceil(this.calculateTotalEigyoKilo(routeSegments) / 10);

        // 第84条 営業キロが10キロメートルまでの片道普通旅客運賃
        if (totalEigyoKilo <= 3) return 140;
        if (totalEigyoKilo <= 6) return 170;
        if (totalEigyoKilo <= 10) return 190;

        const splitKilo: number = this.calculateSplitKiloOfKansen(totalEigyoKilo);
        if (totalEigyoKilo <= 100) return this.addTax(this.ceil10(15.50 * splitKilo));
        if (totalEigyoKilo <= 300) return this.addTax(this.round100(15.50 * splitKilo));
        if (totalEigyoKilo <= 600) return this.addTax(this.round100(15.50 * 300 + 12.30 * (splitKilo - 300)));

        throw new Error(`calculateFareInOsakaで範囲外アクセスが発生しました.`);
    }

    private calculateFare1(routeSegments: RouteSegment[]): number {
        const totalEigyoKilo: number = Math.ceil(this.calculateTotalEigyoKilo(routeSegments) / 10);

        // 第84条の２ 北海道旅客鉄道会社線内の営業キロが10キロメートルまでの片道普通旅客運賃
        // （1）幹線内相互発着の場合
        if (this.isAllKansen(routeSegments)) {
            if (totalEigyoKilo <= 3) return 210;
            if (totalEigyoKilo <= 6) return 270;
            if (totalEigyoKilo <= 10) return 310;
        }

        // （2）地方交通線内相互発着の場合及び幹線と地方交通線を連続して乗車する場合
        else {
            if (totalEigyoKilo <= 3) return 210;
            if (totalEigyoKilo <= 6) return 270;
            if (totalEigyoKilo <= 10) return 320;
        }

        // 第77条の２ 北海道旅客鉄道会社内の幹線内相互発着の大人片道普通旅客運賃
        if (this.isAllKansen(routeSegments)) {

            // 別表第２号イ 北海道旅客鉄道株式会社線の大人普通旅客運賃の特定額（幹線内相互発着となる場合）
            if (321 <= totalEigyoKilo && totalEigyoKilo <= 340) return 6820;
            if (841 <= totalEigyoKilo && totalEigyoKilo <= 880) return 12650;

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
            const splitKilo = this.calculateSplitKiloOfKansen(totalEigyoKilo);
            if (totalEigyoKilo <= 200) return this.addTax(this.round100(21.16 * splitKilo));
            if (totalEigyoKilo <= 300) return this.addTax(this.round100(21.16 * 200 + 16.36 * (splitKilo - 200)));
            if (totalEigyoKilo <= 600) return this.addTax(this.round100(21.16 * 200 + 16.36 * 100 + 12.83 * (splitKilo - 300)));
            return this.addTax(this.round100(21.16 * 200 + 16.36 * 100 + 12.83 * 300 + 7.05 * (splitKilo - 600)));
        }

        // 第77条の６ 北海道旅客鉄道会社内の地方交通線内相互発着の大人片道普通旅客運賃
        if (this.isAllLocal(routeSegments)) {

            // 別表第2号イの5 北海道旅客鉄道株式会社線の大人普通旅客運賃の特定額（地方交通線内相互発着となる場合）
            if (101 <= totalEigyoKilo && totalEigyoKilo <= 110) return 2530;
            if (292 <= totalEigyoKilo && totalEigyoKilo <= 310) return 6820;

            // （1）営業キロが11キロメートルから100キロメートルまでの場合
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

            // （2）営業キロが100キロメートルを超える場合
            const splitKilo = this.calculateSplitKiloOfLocal(totalEigyoKilo);
            if (totalEigyoKilo <= 182) return this.addTax(this.round100(23.11 * splitKilo));
            if (totalEigyoKilo <= 273) return this.addTax(this.round100(23.11 * 182 + 18.35 * (splitKilo - 182)));
            if (totalEigyoKilo <= 546) return this.addTax(this.round100(23.11 * 182 + 18.35 * 91 + 14.02 * (splitKilo - 273)));
            return this.addTax(this.round100(23.11 * 182 + 18.35 * 91 + 14.02 * 273 + 7.72 * (splitKilo - 546)));
        }

        // 第81条の２ 北海道旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人片道普通旅客運賃
        const totalGiseiKilo: number = Math.ceil(this.calculateTotalGiseiKilo(routeSegments) / 10);

        // （1）運賃計算キロが11キロメートルから100キロメートルまでの場合
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

        // （2）運賃計算キロが100キロメートルを超える場合
        const splitKilo = this.calculateSplitKiloOfKansen(totalGiseiKilo);
        if (totalGiseiKilo <= 200) return this.addTax(this.round100(21.16 * splitKilo));
        if (totalGiseiKilo <= 300) return this.addTax(this.round100(21.16 * 200 + 16.36 * (splitKilo - 200)));
        if (totalGiseiKilo <= 600) return this.addTax(this.round100(21.16 * 200 + 16.36 * 100 + 12.83 * (splitKilo - 300)));
        return this.addTax(this.round100(21.16 * 200 + 16.36 * 100 + 12.83 * 300 + 7.05 * (splitKilo - 600)));
    }

    private calculateFare5(routeSegments: RouteSegment[]): number {
        const totalEigyoKilo: number = Math.ceil(this.calculateTotalEigyoKilo(routeSegments) / 10);
        const totalGiseiKilo: number = Math.ceil(this.calculateTotalGiseiKilo(routeSegments) / 10);
        if (totalGiseiKilo == 0) return 0;

        // 第84条の３ 四国旅客鉄道会社線内の営業キロが10キロメートルまでの片道普通旅客運賃
        if (totalEigyoKilo <= 10) {
            if (totalGiseiKilo <= 3) return 190;
            if (totalGiseiKilo <= 6) return 240;
            if (totalGiseiKilo <= 10) return 280;
        }

        // 第77条の３ 四国旅客鉄道会社内の幹線内相互発着の大人片道普通旅客運賃
        // 第77条の７ 四国旅客鉄道会社内の地方交通線内相互発着の大人片道普通旅客運賃
        // 第81条の３ 四国旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人片道普通旅客運賃

        // （1）営業キロが11キロメートルから100キロメートルまでの場合
        if (totalGiseiKilo <= 15) return 330;
        if (totalGiseiKilo <= 20) return 430;
        if (totalGiseiKilo <= 25) return 530;
        if (totalGiseiKilo <= 30) return 630;
        if (totalGiseiKilo <= 35) return 740;
        if (totalGiseiKilo <= 40) return 850;
        if (totalGiseiKilo <= 45) return 980;
        if (totalGiseiKilo <= 50) return 1080;
        if (totalGiseiKilo <= 60) return 1240;
        if (totalGiseiKilo <= 70) return 1430;
        if (totalGiseiKilo <= 80) return 1640;
        if (totalGiseiKilo <= 90) return 1830;
        if (totalGiseiKilo <= 100) return 2010;

        // （2）営業キロが100キロメートルを超える場合
        const splitKilo = this.calculateSplitKiloOfKansen(totalGiseiKilo);
        if (totalGiseiKilo <= 200) return this.addTax(this.round100(19.20 * splitKilo));
        if (totalGiseiKilo <= 300) return this.addTax(this.round100(19.20 * 200 + 16.20 * (splitKilo - 200)));
        if (totalGiseiKilo <= 600) return this.addTax(this.round100(19.20 * 200 + 16.20 * 100 + 12.85 * (splitKilo - 300)));
        return this.addTax(this.round100(19.20 * 200 + 16.20 * 100 + 12.85 * 300 + 7.05 * (splitKilo - 600)));
    }

    private calculateFare6(routeSegments: RouteSegment[]): number {
        const totalEigyoKilo: number = Math.ceil(this.calculateTotalEigyoKilo(routeSegments) / 10);
        const totalGiseiKilo: number = Math.ceil(this.calculateTotalGiseiKilo(routeSegments) / 10);

        // 第84条の４ 九州旅客鉄道会社線内の営業キロが10キロメートルまでの片道普通旅客運賃
        if (totalGiseiKilo == 4 && totalEigyoKilo == 3) return 210;
        if (totalGiseiKilo == 11 && totalEigyoKilo == 10) return 320;
        if (totalGiseiKilo <= 3) return 200;
        if (totalGiseiKilo <= 6) return 240;
        if (totalGiseiKilo <= 10) return 270;

        // 第77条の４ 九州旅客鉄道会社内の幹線内相互発着の大人片道普通旅客運賃
        if (this.isAllKansen(routeSegments)) {

            // （1）営業キロが11キロメートルから100キロメートルまでの場合
            if (totalEigyoKilo <= 15) return 340;
            if (totalEigyoKilo <= 20) return 450;
            if (totalEigyoKilo <= 25) return 560;
            if (totalEigyoKilo <= 30) return 660;
            if (totalEigyoKilo <= 35) return 760;
            if (totalEigyoKilo <= 40) return 870;
            if (totalEigyoKilo <= 45) return 990;
            if (totalEigyoKilo <= 50) return 1090;
            if (totalEigyoKilo <= 60) return 1300;
            if (totalEigyoKilo <= 70) return 1510;
            if (totalEigyoKilo <= 80) return 1730;
            if (totalEigyoKilo <= 90) return 1930;
            if (totalEigyoKilo <= 100) return 2130;

            // （2）営業キロが100キロメートルを超える場合
            // 別表第２号イの３ 九州旅客鉄道株式会社線の大人普通旅客運賃の特定額
            if (301 <= totalEigyoKilo && totalEigyoKilo <= 320) return 6600;
            if (321 <= totalEigyoKilo && totalEigyoKilo <= 340) return 6820;
            if (341 <= totalEigyoKilo && totalEigyoKilo <= 360) return 7150;
            if (381 <= totalEigyoKilo && totalEigyoKilo <= 400) return 7700;
            if (421 <= totalEigyoKilo && totalEigyoKilo <= 440) return 8250;
            if (441 <= totalEigyoKilo && totalEigyoKilo <= 460) return 8580;
            if (461 <= totalEigyoKilo && totalEigyoKilo <= 480) return 8800;
            if (481 <= totalEigyoKilo && totalEigyoKilo <= 500) return 9130;
            if (521 <= totalEigyoKilo && totalEigyoKilo <= 540) return 9680;
            if (561 <= totalEigyoKilo && totalEigyoKilo <= 580) return 10230;
            if (581 <= totalEigyoKilo && totalEigyoKilo <= 600) return 10560;
            if (641 <= totalEigyoKilo && totalEigyoKilo <= 680) return 11110;
            if (681 <= totalEigyoKilo && totalEigyoKilo <= 720) return 11440;
            if (721 <= totalEigyoKilo && totalEigyoKilo <= 760) return 11770;
            if (841 <= totalEigyoKilo && totalEigyoKilo <= 880) return 12650;
            if (881 <= totalEigyoKilo && totalEigyoKilo <= 920) return 12980;
            if (921 <= totalEigyoKilo && totalEigyoKilo <= 960) return 13310;
            if (961 <= totalEigyoKilo && totalEigyoKilo <= 1000) return 13640;
            if (1081 <= totalEigyoKilo && totalEigyoKilo <= 1120) return 14520;
            if (1121 <= totalEigyoKilo && totalEigyoKilo <= 1160) return 14850;
            if (1161 <= totalEigyoKilo && totalEigyoKilo <= 1200) return 15180;
            if (1201 <= totalEigyoKilo && totalEigyoKilo <= 1240) return 15510;
            if (1321 <= totalEigyoKilo && totalEigyoKilo <= 1360) return 16390;
            if (1361 <= totalEigyoKilo && totalEigyoKilo <= 1400) return 16720;
            if (1401 <= totalEigyoKilo && totalEigyoKilo <= 1440) return 17050;
            if (1521 <= totalEigyoKilo && totalEigyoKilo <= 1560) return 17930;
            if (1561 <= totalEigyoKilo && totalEigyoKilo <= 1600) return 18260;
            if (1601 <= totalEigyoKilo && totalEigyoKilo <= 1640) return 18590;
            if (1641 <= totalEigyoKilo && totalEigyoKilo <= 1680) return 18920;
            if (1761 <= totalEigyoKilo && totalEigyoKilo <= 1800) return 19800;
            if (1801 <= totalEigyoKilo && totalEigyoKilo <= 1840) return 20130;
            if (1841 <= totalEigyoKilo && totalEigyoKilo <= 1880) return 20460;
            if (1961 <= totalEigyoKilo && totalEigyoKilo <= 2000) return 21340;

            const splitKilo = this.calculateSplitKiloOfKansen(totalEigyoKilo);
            if (totalEigyoKilo <= 300) return this.addTax(this.round100(19.75 * splitKilo));
            if (totalEigyoKilo <= 600) return this.addTax(this.round100(19.75 * 300 + 12.85 * (splitKilo - 300)));
            return this.addTax(this.round100(19.75 * 300 + 12.85 * 300 + 7.05 * (splitKilo - 600)));
        }

        // 第77条の８ 九州旅客鉄道会社線内の地方交通線内相互発着の大人片道普通旅客運賃
        if (this.isAllLocal(routeSegments)) {
            if (totalGiseiKilo == 11) return 320;
            if (totalGiseiKilo == 16) return 360;
            if (totalGiseiKilo == 17 && totalEigyoKilo == 15) return 360;
            if (totalGiseiKilo == 21) return 470;
            if (totalGiseiKilo == 22) return 470;
            if (totalGiseiKilo == 26 && totalEigyoKilo == 23) return 580;
            if (totalGiseiKilo == 31 && totalEigyoKilo == 28) return 700;
            if (totalGiseiKilo == 36 && totalEigyoKilo == 32) return 840;
            if (totalGiseiKilo == 41 && totalEigyoKilo == 37) return 940;
            if (totalGiseiKilo == 46 && totalEigyoKilo == 41) return 1070;
            if (totalGiseiKilo == 51 && totalEigyoKilo == 46) return 1170;
            if (totalGiseiKilo == 61 && totalEigyoKilo == 55) return 1380;
            if (totalGiseiKilo == 71 && totalEigyoKilo == 64) return 1610;
            if (totalGiseiKilo == 81 && totalEigyoKilo == 73) return 1730;
            if (totalGiseiKilo == 91 && totalEigyoKilo == 82) return 1950;
            if (totalGiseiKilo == 101 && totalEigyoKilo == 91) return 2130;
            if (totalGiseiKilo == 121) return 2670;
            if (totalGiseiKilo == 141 && totalEigyoKilo == 128) return 3150;
            if (totalGiseiKilo == 161 && totalEigyoKilo == 146) return 3580;
            if (totalGiseiKilo == 181 && totalEigyoKilo == 164) return 4120;

            // （1）擬制キロが11キロメートルから100キロメートルまでの場合
            if (totalGiseiKilo <= 15) return 340;
            if (totalGiseiKilo <= 20) return 450;
            if (totalGiseiKilo <= 25) return 560;
            if (totalGiseiKilo <= 30) return 660;
            if (totalGiseiKilo <= 35) return 760;
            if (totalGiseiKilo <= 40) return 870;
            if (totalGiseiKilo <= 45) return 990;
            if (totalGiseiKilo <= 50) return 1090;
            if (totalGiseiKilo <= 60) return 1300;
            if (totalGiseiKilo <= 70) return 1510;
            if (totalGiseiKilo <= 80) return 1730;
            if (totalGiseiKilo <= 90) return 1930;
            if (totalGiseiKilo <= 100) return 2130;

            // （2）擬制キロが100キロメートルを超える場合
            // 別表第２号イの３ 九州旅客鉄道株式会社線の大人普通旅客運賃の特定額
            if (301 <= totalGiseiKilo && totalGiseiKilo <= 320) return 6600;
            if (321 <= totalGiseiKilo && totalGiseiKilo <= 340) return 6820;
            if (341 <= totalGiseiKilo && totalGiseiKilo <= 360) return 7150;
            if (381 <= totalGiseiKilo && totalGiseiKilo <= 400) return 7700;
            if (421 <= totalGiseiKilo && totalGiseiKilo <= 440) return 8250;
            if (441 <= totalGiseiKilo && totalGiseiKilo <= 460) return 8580;
            if (461 <= totalGiseiKilo && totalGiseiKilo <= 480) return 8800;
            if (481 <= totalGiseiKilo && totalGiseiKilo <= 500) return 9130;
            if (521 <= totalGiseiKilo && totalGiseiKilo <= 540) return 9680;
            if (561 <= totalGiseiKilo && totalGiseiKilo <= 580) return 10230;
            if (581 <= totalGiseiKilo && totalGiseiKilo <= 600) return 10560;
            if (641 <= totalGiseiKilo && totalGiseiKilo <= 680) return 11110;
            if (681 <= totalGiseiKilo && totalGiseiKilo <= 720) return 11440;
            if (721 <= totalGiseiKilo && totalGiseiKilo <= 760) return 11770;
            if (841 <= totalGiseiKilo && totalGiseiKilo <= 880) return 12650;
            if (881 <= totalGiseiKilo && totalGiseiKilo <= 920) return 12980;
            if (921 <= totalGiseiKilo && totalGiseiKilo <= 960) return 13310;
            if (961 <= totalGiseiKilo && totalGiseiKilo <= 1000) return 13640;
            if (1081 <= totalGiseiKilo && totalGiseiKilo <= 1120) return 14520;
            if (1121 <= totalGiseiKilo && totalGiseiKilo <= 1160) return 14850;
            if (1161 <= totalGiseiKilo && totalGiseiKilo <= 1200) return 15180;
            if (1201 <= totalGiseiKilo && totalGiseiKilo <= 1240) return 15510;
            if (1321 <= totalGiseiKilo && totalGiseiKilo <= 1360) return 16390;
            if (1361 <= totalGiseiKilo && totalGiseiKilo <= 1400) return 16720;
            if (1401 <= totalGiseiKilo && totalGiseiKilo <= 1440) return 17050;
            if (1521 <= totalGiseiKilo && totalGiseiKilo <= 1560) return 17930;
            if (1561 <= totalGiseiKilo && totalGiseiKilo <= 1600) return 18260;
            if (1601 <= totalGiseiKilo && totalGiseiKilo <= 1640) return 18590;
            if (1641 <= totalGiseiKilo && totalGiseiKilo <= 1680) return 18920;
            if (1761 <= totalGiseiKilo && totalGiseiKilo <= 1800) return 19800;
            if (1801 <= totalGiseiKilo && totalGiseiKilo <= 1840) return 20130;
            if (1841 <= totalGiseiKilo && totalGiseiKilo <= 1880) return 20460;
            if (1961 <= totalGiseiKilo && totalGiseiKilo <= 2000) return 21340;

            const splitKilo = this.calculateSplitKiloOfKansen(totalGiseiKilo);
            if (totalGiseiKilo <= 300) return this.addTax(this.round100(19.75 * splitKilo));
            if (totalGiseiKilo <= 600) return this.addTax(this.round100(19.75 * 300 + 12.85 * (splitKilo - 300)));
            return this.addTax(this.round100(19.75 * 300 + 12.85 * 300 + 7.05 * (splitKilo - 600)));
        }

        // 第81条の４ 九州旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人片道普通旅客運賃
        // （1）擬制キロが11キロメートルから100キロメートルまでの場合
        if (totalGiseiKilo <= 15) return 340;
        if (totalGiseiKilo <= 20) return 450;
        if (totalGiseiKilo <= 25) return 560;
        if (totalGiseiKilo <= 30) return 660;
        if (totalGiseiKilo <= 35) return 760;
        if (totalGiseiKilo <= 40) return 870;
        if (totalGiseiKilo <= 45) return 990;
        if (totalGiseiKilo <= 50) return 1090;
        if (totalGiseiKilo <= 60) return 1300;
        if (totalGiseiKilo <= 70) return 1510;
        if (totalGiseiKilo <= 80) return 1730;
        if (totalGiseiKilo <= 90) return 1930;
        if (totalGiseiKilo <= 100) return 2130;

        // （2）擬制キロが100キロメートルを超える場合
        // 別表第２号イの３ 九州旅客鉄道株式会社線の大人普通旅客運賃の特定額
        if (301 <= totalGiseiKilo && totalGiseiKilo <= 320) return 6600;
        if (321 <= totalGiseiKilo && totalGiseiKilo <= 340) return 6820;
        if (341 <= totalGiseiKilo && totalGiseiKilo <= 360) return 7150;
        if (381 <= totalGiseiKilo && totalGiseiKilo <= 400) return 7700;
        if (421 <= totalGiseiKilo && totalGiseiKilo <= 440) return 8250;
        if (441 <= totalGiseiKilo && totalGiseiKilo <= 460) return 8580;
        if (461 <= totalGiseiKilo && totalGiseiKilo <= 480) return 8800;
        if (481 <= totalGiseiKilo && totalGiseiKilo <= 500) return 9130;
        if (521 <= totalGiseiKilo && totalGiseiKilo <= 540) return 9680;
        if (561 <= totalGiseiKilo && totalGiseiKilo <= 580) return 10230;
        if (581 <= totalGiseiKilo && totalGiseiKilo <= 600) return 10560;
        if (641 <= totalGiseiKilo && totalGiseiKilo <= 680) return 11110;
        if (681 <= totalGiseiKilo && totalGiseiKilo <= 720) return 11440;
        if (721 <= totalGiseiKilo && totalGiseiKilo <= 760) return 11770;
        if (841 <= totalGiseiKilo && totalGiseiKilo <= 880) return 12650;
        if (881 <= totalGiseiKilo && totalGiseiKilo <= 920) return 12980;
        if (921 <= totalGiseiKilo && totalGiseiKilo <= 960) return 13310;
        if (961 <= totalGiseiKilo && totalGiseiKilo <= 1000) return 13640;
        if (1081 <= totalGiseiKilo && totalGiseiKilo <= 1120) return 14520;
        if (1121 <= totalGiseiKilo && totalGiseiKilo <= 1160) return 14850;
        if (1161 <= totalGiseiKilo && totalGiseiKilo <= 1200) return 15180;
        if (1201 <= totalGiseiKilo && totalGiseiKilo <= 1240) return 15510;
        if (1321 <= totalGiseiKilo && totalGiseiKilo <= 1360) return 16390;
        if (1361 <= totalGiseiKilo && totalGiseiKilo <= 1400) return 16720;
        if (1401 <= totalGiseiKilo && totalGiseiKilo <= 1440) return 17050;
        if (1521 <= totalGiseiKilo && totalGiseiKilo <= 1560) return 17930;
        if (1561 <= totalGiseiKilo && totalGiseiKilo <= 1600) return 18260;
        if (1601 <= totalGiseiKilo && totalGiseiKilo <= 1640) return 18590;
        if (1641 <= totalGiseiKilo && totalGiseiKilo <= 1680) return 18920;
        if (1761 <= totalGiseiKilo && totalGiseiKilo <= 1800) return 19800;
        if (1801 <= totalGiseiKilo && totalGiseiKilo <= 1840) return 20130;
        if (1841 <= totalGiseiKilo && totalGiseiKilo <= 1880) return 20460;
        if (1961 <= totalGiseiKilo && totalGiseiKilo <= 2000) return 21340;

        const splitKilo = this.calculateSplitKiloOfKansen(totalGiseiKilo);
        if (totalGiseiKilo <= 300) return this.addTax(this.round100(19.75 * splitKilo));
        if (totalGiseiKilo <= 600) return this.addTax(this.round100(19.75 * 300 + 12.85 * (splitKilo - 300)));
        return this.addTax(this.round100(19.75 * 300 + 12.85 * 300 + 7.05 * (splitKilo - 600)));
    }

    // 第140号 鉄道駅バリアフリー料金
    private calculateBarrierFreeFeeFromCorrectedPath(correctedPath: PathStep[]): number {
        const routeKeys = this.convertPathStepsToRouteKeys(correctedPath);
        if (this.isAllTrainSpecificSections("東京附近", routeKeys)) return 10;
        if (this.isAllTrainSpecificSections("大阪附近", routeKeys)) return 10;
        if (this.isAllTrainSpecificSections("名古屋附近", routeKeys)) return 10;
        return 0;
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
