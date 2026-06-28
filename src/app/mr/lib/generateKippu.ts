import { calculateTotalEigyoKilo, calculateValidDaysFromKilo, convertPathStepsToRouteSegments, generatePrintedViaStrings, whichMajorCitySuburbanSections } from '@/app/utils/calc';
import { load } from '@/app/utils/load';
import { loadLines } from '@/app/mr/lib/loadLines';
import { loadKanas } from '@/app/mr/lib/loadKanas';
import { correctPath, uncorrectPath } from '@/app/utils/correctPath';
import { calculateFareFromPath } from '@/app/utils/calcFare';
import { cheapestPathAndFare } from '@/app/utils/cheapestPath';

import { RouteRequest, KippuData, PathStep, CalculationMode } from '@/app/types';

interface GenerateKippuOptions {
    calculationMode?: CalculationMode;
}

function getCorrectedPath(path: PathStep[], calculationMode: CalculationMode): PathStep[] {
    let fullPath = createFullPath(path);
    let correctedPath: PathStep[];

    switch (calculationMode) {
        case "uncorrect":
            correctedPath = uncorrectPath(fullPath);
            break;
        case "cheapest":
            correctedPath = cheapestPathAndFare(fullPath).path;
            break;
        case "normal":
        default:
            correctedPath = correctPath(fullPath);
            break;
    }
    return correctedPath;
}

export function generateKippu(request: RouteRequest, options: GenerateKippuOptions = {}): KippuData {
    const userInputPath = request.path;
    const calculationMode = options.calculationMode ?? "normal";

    const correctedPath = getCorrectedPath(userInputPath, calculationMode);

    // 重複駅チェック (通常、最安、補正禁止の3パターンすべてに適用。環状・6の字乗車を許容するため、最後の一駅を除いた区間内での重複をチェックする)
    const stationNames = correctedPath.map(p => p.stationName);
    const firstPart = stationNames.slice(0, -1);
    const hasDuplicateInFirstPart = firstPart.some((name, index) => firstPart.indexOf(name) !== index);
    if (hasDuplicateInFirstPart) {
        throw new Error("経路が重複しています。");
    }

    // 大都市近郊区間の判定と運賃取得
    let fullPath = createFullPath(userInputPath);
    const majorCitySuburbanSection = whichMajorCitySuburbanSections(fullPath);

    if (calculationMode === "cheapest" || calculationMode === "normal") {
        if (majorCitySuburbanSection !== null) {
            return load.getMajorCitySuburbanSectionFares(
                majorCitySuburbanSection,
                fullPath[0].stationName,
                fullPath[fullPath.length - 1].stationName
            );
        }
    }

    // 出発駅と到着駅の名前を取得して変数に代入
    const departureStation = correctedPath[0].stationName;
    const arrivalStation = correctedPath[correctedPath.length - 1].stationName;

    // 営業キロと運賃の計算
    const routeSegments = convertPathStepsToRouteSegments(correctedPath);
    const totalEigyoKilo = calculateTotalEigyoKilo(routeSegments);
    const fare = calculateFareFromPath(correctedPath);
    const validDays = majorCitySuburbanSection === null ? calculateValidDaysFromKilo(totalEigyoKilo) : 1;
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

export function createFullPath(path: PathStep[]): PathStep[] {
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
