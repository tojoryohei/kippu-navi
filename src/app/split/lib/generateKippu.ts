import { calculateTotalEigyoKilo, calculateValidDaysFromKilo, convertPathStepsToRouteSegments, generatePrintedViaStrings, getFareForPath } from '@/app/utils/calc';
import { KippuData, PathStep } from '@/app/types';
import { correctPath } from '@/app/utils/correctPath';

export function generateKippu(fullPath: PathStep[]): KippuData {

    // 経路の補正
    const correctedPath = correctPath(fullPath);

    // 出発駅と到着駅の名前を取得して変数に代入
    const departureStation = correctedPath[0].stationName;
    const arrivalStation = correctedPath[correctedPath.length - 1].stationName;

    // 営業キロと運賃の計算
    const routeSegments = convertPathStepsToRouteSegments(correctedPath);
    const totalEigyoKilo = calculateTotalEigyoKilo(routeSegments);
    const fare = getFareForPath(correctedPath);
    const validDays = calculateValidDaysFromKilo(totalEigyoKilo);

    // 経由文字列の生成 (ユーザー入力の経路を使用)
    const printedViaLines = generatePrintedViaStrings(correctedPath);
    return {
        totalEigyoKilo,
        departureStation,
        arrivalStation,
        fare,
        printedViaLines,
        validDays
    };
}
