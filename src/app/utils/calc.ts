import { load } from '@/components/load';
import { PathStep, RouteSegment, TrainSpecificSection } from '@/app/types';


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

export function generatePrintedViaStrings(pathSteps: PathStep[]): string[] {
    const viaLines: string[] = [];
    for (const pathStep of pathSteps) {
        if (viaLines.length === 0 || (viaLines[viaLines.length - 1] !== pathStep.lineName!))
            viaLines.push(pathStep.lineName!);
    }
    const printedViaLines: string[] = [];
    for (const viaLine of viaLines) {
        const printing = load.getPrinting(viaLine)
        if (printing !== null)
            printedViaLines.push(printing);
    }
    return printedViaLines;
}
