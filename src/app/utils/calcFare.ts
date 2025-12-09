import { load } from '@/app/utils/load';
import { createRouteKey, calculateTotalEigyoKilo, calculateTotalGiseiKilo, isAllTrainSpecificSections } from '@/app/utils/calc';

import { PathStep, RouteSegment } from '@/app/types';

export function calculateFareFromPath(fullPath: PathStep[]): number {
    let fare: number = 0;

    if (fullPath.length <= 1) return fare;
    // 第79条 東京附近等の特定区間等における大人片道普通旅客運賃の特定
    const specificFare = load.getSpecificFares(fullPath);
    if (specificFare !== null) {
        return specificFare;
    }

    const routeKeys = new Set<string>();
    const routeSegments: RouteSegment[] = [];
    const routeSegmentsByCompany: RouteSegment[][] = [[], [], [], [], [], [], []];
    // 0 = その他, 1 = JR北海道, 2 = JR東日本, 3 = JR東海, 4 = JR西日本, 5 = JR四国, 6 = JR九州

    for (let i = 0; i < fullPath.length - 1; i++) {
        const line = fullPath[i].lineName;
        if (line === null) throw new Error(`calculateFareFromCorrectedPathでエラーが発生しました.`);
        const routeSegment = load.getRouteSegment(line, fullPath[i].stationName, fullPath[i + 1].stationName);

        // 全ての駅間のデータを取得
        routeKeys.add(createRouteKey(routeSegment.line, routeSegment.station0, routeSegment.station1));
        routeSegments.push(routeSegment);

        // routeSegmentを会社ごとに分ける
        routeSegmentsByCompany[routeSegment.company].push(routeSegment);
    }

    // 第78条 電車特定区間内等の大人片道普通旅客運賃
    // （1） 山手線内の駅相互発着の場合
    if (isAllTrainSpecificSections("山手線内", [...routeKeys])) {
        fare = calculateFareInYamanote(routeSegments);
    }
    // （2） イ 東京附近における電車特定区間内相互発着の場合
    else if (isAllTrainSpecificSections("東京附近", [...routeKeys])) {
        fare = calculateFareInTokyo(routeSegments);
    }
    // （2） ロ 大阪附近における電車特定区間内相互発着の場合
    else if (isAllTrainSpecificSections("大阪附近", [...routeKeys])) {
        fare = calculateFareInOsaka(routeSegments);
    }

    // 第85条 他の旅客鉄道会社線を連続して乗車する場合の大人片道普通旅客運賃
    else fare = calculateFare(routeSegments);

    // （1）北海道旅客鉄道会社線の乗車区間に対する普通旅客運賃の加算額
    if (0 < routeSegmentsByCompany[1].length) {
        fare += calculateFare1(routeSegmentsByCompany[1]) - calculateFare(routeSegmentsByCompany[1]);
    }

    // （2）四国旅客鉄道会社線の乗車区間に対する普通旅客運賃の加算額
    if (0 < routeSegmentsByCompany[5].length) {
        fare += calculateFare5(routeSegmentsByCompany[5]) - calculateFare(routeSegmentsByCompany[5]);
    }

    // （3）九州旅客鉄道会社線の乗車区間に対する普通旅客運賃の加算額
    if (0 < routeSegmentsByCompany[6].length) {
        fare += calculateFare6(routeSegmentsByCompany[6]) - calculateFare(routeSegmentsByCompany[6]);
    }

    // 第85条の２ 加算普通旅客運賃の適用区間及び額
    if (routeKeys.has(createRouteKey("チトセ２", "南千歳", "新千歳空港"))) {
        fare += 20;
    }
    if (routeKeys.has(createRouteKey("カンク", "日根野", "りんくうタウン"))
        && routeKeys.has(createRouteKey("カンク", "りんくうタウン", "関西空港"))) {
        fare += 220;
    } else if (routeKeys.has(createRouteKey("カンク", "日根野", "りんくうタウン"))) {
        fare += 160;
    } else if (routeKeys.has(createRouteKey("カンク", "りんくうタウン", "関西空港"))) {
        fare += 170;
    }
    if (routeKeys.has(createRouteKey("ヒサセ", "児島", "宇多津"))) {
        fare += 110;
    }
    if (routeKeys.has(createRouteKey("ミヤクウ", "田吉", "宮崎空港"))) {
        fare += 130;
    }

    return fare;
}

function isAllKansen(routeSegments: RouteSegment[]): boolean {
    for (const routeSegment of routeSegments) {
        if (routeSegment.isLocal === true) return false;
    }
    return true;
}

function isAllLocal(routeSegments: RouteSegment[]): boolean {
    for (const routeSegment of routeSegments) {
        if (routeSegment.isLocal === false) return false;
    }
    return true;
}

function ceil1000(n: number): number {
    return Math.ceil(n / 1000) * 1000;
}

function round1000(n: number): number {
    return Math.round(n / 1000) * 1000;
}

function round10000(n: number): number {
    return Math.round(n / 10000) * 10000;
}

function calculateSplitKiloOfKansen(totalKilo: number): number {
    if (10 < totalKilo && totalKilo <= 50) return Math.floor((totalKilo - 1) / 5) * 5 + 3;
    if (50 < totalKilo && totalKilo <= 100) return Math.floor((totalKilo - 1) / 10) * 10 + 5;
    if (100 < totalKilo && totalKilo <= 600) return Math.floor((totalKilo - 1) / 20) * 20 + 10;
    if (600 < totalKilo) return Math.floor((totalKilo - 1) / 40) * 40 + 20;
    throw new Error(`calculateSplitKiloOfKansenでエラーが発生しました.`);
}

// 別表第２号イの４ 地方交通線の営業キロの区間
function calculateSplitKiloOfLocal(totalKilo: number): number {
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

function calculateFare(routeSegments: RouteSegment[]): number {
    const totalEigyoKilo: number = Math.ceil(calculateTotalEigyoKilo(routeSegments) / 10);

    // 第84条 営業キロが10キロメートルまでの片道普通旅客運賃
    // （1）幹線内相互発着の場合
    if (isAllKansen(routeSegments)) {
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
    if (isAllKansen(routeSegments)) {
        const splitKilo = calculateSplitKiloOfKansen(totalEigyoKilo);
        if (totalEigyoKilo <= 100) return round1000(ceil1000(1620 * splitKilo) * 11 / 10) / 100;
        if (totalEigyoKilo <= 300) return round1000(round10000(1620 * splitKilo) * 11 / 10) / 100;
        if (totalEigyoKilo <= 600) return round1000(round10000(1620 * 300 + 1285 * (splitKilo - 300)) * 11 / 10) / 100;
        return round1000(round10000(1620 * 300 + 1285 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
    }

    // 第77条の５ 地方交通線内相互発着の大人片道普通旅客運賃
    if (isAllLocal(routeSegments)) {
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

        const splitKilo = calculateSplitKiloOfLocal(totalEigyoKilo);
        if (totalEigyoKilo <= 100) return round1000(ceil1000(1780 * splitKilo) * 11 / 10) / 100;
        if (totalEigyoKilo <= 273) return round1000(round10000(1780 * splitKilo) * 11 / 10) / 100;
        if (totalEigyoKilo <= 546) return round1000(round10000(1780 * 273 + 1410 * (splitKilo - 273)) * 11 / 10) / 100;
        return round1000(round10000(1780 * 273 + 1410 * 273 + 770 * (splitKilo - 546)) * 11 / 10) / 100;
    }

    // 第81条 幹線と地方交通線を連続して乗車する場合の大人片道普通旅客運賃
    const totalGiseiKilo: number = Math.ceil(calculateTotalGiseiKilo(routeSegments) / 10);
    const splitKilo = calculateSplitKiloOfKansen(totalGiseiKilo);
    if (totalGiseiKilo <= 100) return round1000(ceil1000(1620 * splitKilo) * 11 / 10) / 100;
    if (totalGiseiKilo <= 300) return round1000(round10000(1620 * splitKilo) * 11 / 10) / 100;
    if (totalGiseiKilo <= 600) return round1000(round10000(1620 * 300 + 1285 * (splitKilo - 300)) * 11 / 10) / 100;
    return round1000(round10000(1620 * 300 + 1285 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
}

function calculateFareInYamanote(routeSegments: RouteSegment[]): number {
    const totalEigyoKilo: number = Math.ceil(calculateTotalEigyoKilo(routeSegments) / 10);

    // 第84条 営業キロが10キロメートルまでの片道普通旅客運賃
    if (totalEigyoKilo <= 3) return 140;
    if (totalEigyoKilo <= 6) return 160;
    if (totalEigyoKilo <= 10) return 170;

    const splitKilo: number = calculateSplitKiloOfKansen(totalEigyoKilo);
    if (totalEigyoKilo <= 100) return ceil1000(ceil1000(1325 * splitKilo) * 11 / 10) / 100;
    if (totalEigyoKilo <= 300) return ceil1000(round10000(1325 * splitKilo) * 11 / 10) / 100;

    throw new Error(`calculateFareInYamanoteで範囲外アクセスが発生しました.`);
}

function calculateFareInTokyo(routeSegments: RouteSegment[]): number {
    const totalEigyoKilo: number = Math.ceil(calculateTotalEigyoKilo(routeSegments) / 10);

    // 第84条 営業キロが10キロメートルまでの片道普通旅客運賃
    if (totalEigyoKilo <= 3) return 140;
    if (totalEigyoKilo <= 6) return 160;
    if (totalEigyoKilo <= 10) return 170;

    const splitKilo: number = calculateSplitKiloOfKansen(totalEigyoKilo);
    if (totalEigyoKilo <= 100) return ceil1000(ceil1000(1530 * splitKilo) * 11 / 10) / 100;
    if (totalEigyoKilo <= 300) return ceil1000(round10000(1530 * splitKilo) * 11 / 10) / 100;
    if (totalEigyoKilo <= 600) return ceil1000(round10000((1530 * 300 + 1215 * (splitKilo - 300)) * 11 / 10)) / 100;

    throw new Error(`calculateFareInTokyoで範囲外アクセスが発生しました.`);
}

function calculateFareInOsaka(routeSegments: RouteSegment[]): number {
    const totalEigyoKilo: number = Math.ceil(calculateTotalEigyoKilo(routeSegments) / 10);

    // 第84条 営業キロが10キロメートルまでの片道普通旅客運賃
    if (totalEigyoKilo <= 3) return 140;
    if (totalEigyoKilo <= 6) return 170;
    if (totalEigyoKilo <= 10) return 190;

    const splitKilo: number = calculateSplitKiloOfKansen(totalEigyoKilo);
    if (totalEigyoKilo <= 100) return round1000(ceil1000(1550 * splitKilo) * 11 / 10) / 100;
    if (totalEigyoKilo <= 300) return round1000(round10000(1550 * splitKilo) * 11 / 10) / 100;
    if (totalEigyoKilo <= 600) return round1000(round10000(1550 * 300 + 1230 * (splitKilo - 300)) * 11 / 10) / 100;

    throw new Error(`calculateFareInOsakaで範囲外アクセスが発生しました.`);
}

function calculateFare1(routeSegments: RouteSegment[]): number {
    const totalEigyoKilo: number = Math.ceil(calculateTotalEigyoKilo(routeSegments) / 10);

    // 第84条の２ 北海道旅客鉄道会社線内の営業キロが10キロメートルまでの片道普通旅客運賃
    // （1）幹線内相互発着の場合
    if (isAllKansen(routeSegments)) {
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
    if (isAllKansen(routeSegments)) {

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
        const splitKilo = calculateSplitKiloOfKansen(totalEigyoKilo);
        if (totalEigyoKilo <= 200) return round1000(round10000(2116 * splitKilo) * 11 / 10) / 100;
        if (totalEigyoKilo <= 300) return round1000(round10000(2116 * 200 + 1636 * (splitKilo - 200)) * 11 / 10) / 100;
        if (totalEigyoKilo <= 600) return round1000(round10000(2116 * 200 + 1636 * 100 + 1283 * (splitKilo - 300)) * 11 / 10) / 100;
        return round1000(round10000(2116 * 200 + 1636 * 100 + 1283 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
    }

    // 第77条の６ 北海道旅客鉄道会社内の地方交通線内相互発着の大人片道普通旅客運賃
    if (isAllLocal(routeSegments)) {

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
        const splitKilo = calculateSplitKiloOfLocal(totalEigyoKilo);
        if (totalEigyoKilo <= 182) return round1000(round10000(2311 * splitKilo) * 11 / 10) / 100;
        if (totalEigyoKilo <= 273) return round1000(round10000(2311 * 182 + 1835 * (splitKilo - 182)) * 11 / 10) / 100;
        if (totalEigyoKilo <= 546) return round1000(round10000(2311 * 182 + 1835 * 91 + 1402 * (splitKilo - 273)) * 11 / 10) / 100;
        return round1000(round10000(2311 * 182 + 1835 * 91 + 1402 * 273 + 772 * (splitKilo - 546)) * 11 / 10) / 100;
    }

    // 第81条の２ 北海道旅客鉄道会社内の幹線と地方交通線を連続して乗車する場合の大人片道普通旅客運賃
    const totalGiseiKilo: number = Math.ceil(calculateTotalGiseiKilo(routeSegments) / 10);

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
    const splitKilo = calculateSplitKiloOfKansen(totalGiseiKilo);
    if (totalGiseiKilo <= 200) return round1000(round10000(2116 * splitKilo) * 11 / 10) / 100;
    if (totalGiseiKilo <= 300) return round1000(round10000(2116 * 200 + 1636 * (splitKilo - 200)) * 11 / 10) / 100;
    if (totalGiseiKilo <= 600) return round1000(round10000(2116 * 200 + 1636 * 100 + 1283 * (splitKilo - 300)) * 11 / 10) / 100;
    return round1000(round10000(2116 * 200 + 1636 * 100 + 1283 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
}

function calculateFare5(routeSegments: RouteSegment[]): number {
    const totalEigyoKilo: number = Math.ceil(calculateTotalEigyoKilo(routeSegments) / 10);
    const totalGiseiKilo: number = Math.ceil(calculateTotalGiseiKilo(routeSegments) / 10);
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
    const splitKilo = calculateSplitKiloOfKansen(totalGiseiKilo);
    if (totalGiseiKilo <= 200) return round1000(round10000(1920 * splitKilo) * 11 / 10) / 100;
    if (totalGiseiKilo <= 300) return round1000(round10000(1920 * 200 + 1620 * (splitKilo - 200)) * 11 / 10) / 100;
    if (totalGiseiKilo <= 600) return round1000(round10000(1920 * 200 + 1620 * 100 + 1285 * (splitKilo - 300)) * 11 / 10) / 100;
    return round1000(round10000(1920 * 200 + 1620 * 100 + 1285 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
}

function calculateFare6(routeSegments: RouteSegment[]): number {
    const totalEigyoKilo: number = Math.ceil(calculateTotalEigyoKilo(routeSegments) / 10);
    const totalGiseiKilo: number = Math.ceil(calculateTotalGiseiKilo(routeSegments) / 10);

    // 第84条の４ 九州旅客鉄道会社線内の営業キロが10キロメートルまでの片道普通旅客運賃
    if (totalGiseiKilo == 4 && totalEigyoKilo == 3) return 210;
    if (totalGiseiKilo == 11 && totalEigyoKilo == 10) return 320;
    if (totalGiseiKilo <= 3) return 200;
    if (totalGiseiKilo <= 6) return 240;
    if (totalGiseiKilo <= 10) return 270;

    // 第77条の４ 九州旅客鉄道会社内の幹線内相互発着の大人片道普通旅客運賃
    if (isAllKansen(routeSegments)) {

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

        const splitKilo = calculateSplitKiloOfKansen(totalEigyoKilo);
        if (totalEigyoKilo <= 300) return round1000(round10000(1975 * splitKilo) * 11 / 10) / 100;
        if (totalEigyoKilo <= 600) return round1000(round10000(1975 * 300 + 1285 * (splitKilo - 300)) * 11 / 10) / 100;
        return round1000(round10000(1975 * 300 + 1285 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
    }

    // 第77条の８ 九州旅客鉄道会社線内の地方交通線内相互発着の大人片道普通旅客運賃
    if (isAllLocal(routeSegments)) {
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

        const splitKilo = calculateSplitKiloOfKansen(totalGiseiKilo);
        if (totalGiseiKilo <= 300) return round1000(round10000(1975 * splitKilo) * 11 / 10) / 100;
        if (totalGiseiKilo <= 600) return round1000(round10000(1975 * 300 + 1285 * (splitKilo - 300)) * 11 / 10) / 100;
        return round1000(round10000(1975 * 300 + 1285 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
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

    const splitKilo = calculateSplitKiloOfKansen(totalGiseiKilo);
    if (totalGiseiKilo <= 300) return round1000(round10000(1975 * splitKilo) * 11 / 10) / 100;
    if (totalGiseiKilo <= 600) return round1000(round10000(1975 * 300 + 1285 * (splitKilo - 300)) * 11 / 10) / 100;
    return round1000(round10000(1975 * 300 + 1285 * 300 + 705 * (splitKilo - 600)) * 11 / 10) / 100;
}

function convertPathStepsToRouteKeys(path: PathStep[]): string[] {
    let routeKeys: string[] = [];
    for (let i = 0; i < path.length - 1; i++) {
        const line = path[i].lineName;
        if (line === null) continue;
        const routeKey: string = createRouteKey(line, path[i].stationName, path[i + 1].stationName);
        routeKeys.push(routeKey);
    }
    return routeKeys;
}

// 第140条 鉄道駅バリアフリー料金
export function calculateBarrierFreeFeeFromPath(fullPath: PathStep[]): number {
    const routeKeys = convertPathStepsToRouteKeys(fullPath);
    if (isAllTrainSpecificSections("東京附近", routeKeys)) return 10;
    if (isAllTrainSpecificSections("大阪附近", routeKeys)) return 10;
    if (isAllTrainSpecificSections("名古屋附近", routeKeys)) return 10;
    return 0;
}
