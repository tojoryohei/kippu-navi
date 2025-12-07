import { load } from '@/components/load';
import { PathStep, RouteSegment, TrainSpecificSection } from '@/app/types';
import { correctPath } from '@/components/correctPath';
import { calculateBarrierFreeFeeFromPath, calculateFareFromPath } from '@/components/calcFare';

export function calculateTotalEigyoKilo(routeSegments: RouteSegment[]): number {
    let totalEigyoKilo: number = 0;
    for (const routeSegment of routeSegments) {
        totalEigyoKilo += routeSegment.eigyoKilo;
    }
    return totalEigyoKilo;
}

export function calculateTotalGiseiKilo(routeSegments: RouteSegment[]): number {
    let totalGiseiKilo: number = 0;
    for (const routeSegment of routeSegments) {
        totalGiseiKilo += routeSegment.giseiKilo;
    }
    return totalGiseiKilo;
}

export function getFareForPath(path: PathStep[]): number {
    const correctedPath = correctPath(path);
    return calculateFareFromPath(correctedPath) + calculateBarrierFreeFeeFromPath(correctedPath);
}

export function createRouteKey(line: string, stationName0: string, stationName1: string): string {
    return [line, ...[stationName0, stationName1].sort()].join('-');
}

export function isAllTrainSpecificSections(specificSectionName: keyof TrainSpecificSection, routeKeys: string[]): boolean {
    const trainSpecificSection = load.getTrainSpecificSections(specificSectionName);
    for (const routeKey of routeKeys) {
        if (trainSpecificSection.has(routeKey) === false) return false;
    }
    return true;
}

export function calculateValidDaysFromKilo(totalEigyoKilo: number): number {
    return totalEigyoKilo <= 1000 ? 1 : Math.ceil(totalEigyoKilo / 2000) + 1;
}

export function convertPathStepsToRouteSegments(path: PathStep[]): RouteSegment[] {
    let routeSegments: RouteSegment[] = [];
    for (let i = 0; i < path.length - 1; i++) {
        const line = path[i].lineName;
        if (line === null) continue;
        const routeSegment: RouteSegment = load.getRouteSegment(line, path[i].stationName, path[i + 1].stationName);
        routeSegments.push(routeSegment);
    }
    return routeSegments;
}

export function generatePrintedViaStrings(fullPath: PathStep[]): string[] {
    const viaLines: string[] = [];
    const printedViaLines: string[] = [];

    for (let i = 0; i < fullPath.length - 1; i++) {
        const kana = fullPath[i].lineName;
        if (kana === null) continue;
        const printing = load.getPrinting(kana);
        if (printing !== null) {
            if (0 < printedViaLines.length) {
                if (kana !== viaLines[viaLines.length - 1]) {
                    viaLines.push(kana);
                    printedViaLines.push(printing);
                }
                else if (fullPath[i].stationName === "京橋" &&
                    fullPath[i].lineName === "オオサ１"
                ) {
                    printedViaLines.push("京橋")
                }
                else if (fullPath[i].stationName === "西九条" &&
                    fullPath[i].lineName === "オオサ２"
                ) {
                    printedViaLines.push("西九条")
                }
            }
            else {
                viaLines.push(kana);
                printedViaLines.push(printing);
            }
        }
    }
    return printedViaLines;
}
