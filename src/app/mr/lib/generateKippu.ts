import { calculateTotalEigyoKilo, calculateValidDaysFromKilo, convertPathStepsToRouteSegments, generatePrintedViaStrings } from '@/app/utils/calc';
import { loadLines } from '@/app/mr/lib/loadLines';
import { loadKanas } from '@/app/mr/lib/loadKanas';
import { correctPath, uncorrectPath } from '@/app/utils/correctPath';
import { calculateFareFromPath, calculateBarrierFreeFeeFromPath } from '@/app/utils/calcFare';
import { cheapestPathAndFare } from '@/app/utils/cheapestPath';

import { RouteRequest, KippuData, PathStep, CalculationMode } from '@/app/types';

export interface GenerateKippuOptions {
    calculationMode?: CalculationMode;
}

export function generateKippu(request: RouteRequest, options: GenerateKippuOptions = {}): KippuData {
    const userInputPath = request.path;
    const calculationMode = options.calculationMode ?? "normal";

    // 経路の展開
    let fullPath = createFullPath(userInputPath);

    // 経路の補正
    let correctedPath: PathStep[];
    let cheapestFare: number | null = null;
    switch (calculationMode) {
        case "uncorrect":
            correctedPath = uncorrectPath(fullPath);
            break;
        case "cheapest":
            const cheapestResult = cheapestPathAndFare(fullPath);
            correctedPath = cheapestResult.path;
            break;
        case "normal":
        default:
            correctedPath = correctPath(fullPath);
            break;
    }

    // 出発駅と到着駅の名前を取得して変数に代入
    const departureStation = correctedPath[0].stationName;
    const arrivalStation = correctedPath[correctedPath.length - 1].stationName;

    // 営業キロと運賃の計算
    const routeSegments = convertPathStepsToRouteSegments(correctedPath);
    const totalEigyoKilo = calculateTotalEigyoKilo(routeSegments);

    const fare = cheapestFare !== null
        ? cheapestFare
        : calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);

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

function createFullPath(path: PathStep[]): PathStep[] {
    if (path.length <= 1) {
        return path;
    }
    const fullPath: PathStep[] = [];
    for (let i = 0; i < path.length - 1; i++) {
        const startStep = path[i];
        const endStep = path[i + 1];
        const lineName = startStep.lineName!;
        const line = loadLines.getLineByName(lineName);
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
    for (let i = 0; i < fullPath.length - 1; i++) {
        fullPath[i].lineName = loadKanas.getKana(fullPath[i].lineName!, fullPath[i].stationName, fullPath[i + 1].stationName);
    }
    return fullPath;
}
