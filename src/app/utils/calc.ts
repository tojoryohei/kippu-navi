import { load } from '@/app/utils/load';
import { MajorCitySuburbanSection, PathStep, RouteSegment, TrainSpecificSection } from '@/app/types';

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

export function ceil1000(n: number): number {
    return Math.ceil(n / 1000) * 1000;
}

export function round1000(n: number): number {
    return Math.round(n / 1000) * 1000;
}

export function round10000(n: number): number {
    return Math.round(n / 10000) * 10000;
}

export function createPairKey(station0: string, station1: string): string {
    return [station0, station1].sort().join('-');
}

export function createRouteKey(line: string, station0: string, station1: string): string {
    return [line, ...[station0, station1].sort()].join('-');
}

export function isAllTrainSpecificSections(specificSection: keyof TrainSpecificSection, routeKeys: Set<string>): boolean {
    const trainSpecificSections = load.getTrainSpecificSections(specificSection);
    for (const routeKey of routeKeys) {
        if (trainSpecificSections.has(routeKey) === false) return false;
    }
    return true;
}

export function whichMajorCitySuburbanSections(fullPath: PathStep[]): keyof MajorCitySuburbanSection | null {
    const routeKeys: string[] = [];
    for (let i = 0; i < fullPath.length - 1; i++) {
        routeKeys.push(createRouteKey(fullPath[i].lineName!, fullPath[i].stationName, fullPath[i + 1].stationName));
    }
    const majorCitySuburbanSections = load.getMajorCitySuburbanSections();
    const majorCityNames = Object.keys(majorCitySuburbanSections) as (keyof MajorCitySuburbanSection)[];
    for (const majorCityName of majorCityNames) {
        const sectionRouteSet = majorCitySuburbanSections[majorCityName];
        const isFullyContained = routeKeys.every(routeKey => sectionRouteSet.has(routeKey));
        if (isFullyContained === true) {
            return majorCityName;
        }
    }
    return null;
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

export function applyOneSideCityRule(fullPath: PathStep[], direction: string): PathStep[] | null {
    const cities = load.getCities();

    if (direction === "forward") {
        for (const city of cities) {
            const stationsInCity = new Set(city.stations);

            // 発駅適用
            if (stationsInCity.has(fullPath[0].stationName)) {
                const changingIdx: number[] = [];
                for (let i = 0; i < fullPath.length - 1; i++) {
                    if (i !== 0 &&
                        city.name === "大阪市内" &&
                        fullPath[i - 1].stationName === "加島" &&
                        fullPath[i].stationName === "尼崎" &&
                        fullPath[i + 1].stationName === "塚本")
                        changingIdx.pop();
                    else if (i !== 0 &&
                        city.name === "大阪市内" &&
                        fullPath[i - 1].stationName === "塚本" &&
                        fullPath[i].stationName === "尼崎" &&
                        fullPath[i + 1].stationName === "加島")
                        changingIdx.pop();
                    else if (i !== 0 &&
                        city.name === "大阪市内" &&
                        fullPath[i - 1].stationName === "加美" &&
                        fullPath[i].stationName === "久宝寺" &&
                        fullPath[i + 1].stationName === "新加美")
                        changingIdx.pop();
                    else if (i !== 0 &&
                        city.name === "大阪市内" &&
                        fullPath[i - 1].stationName === "新加美" &&
                        fullPath[i].stationName === "久宝寺" &&
                        fullPath[i + 1].stationName === "加美")
                        changingIdx.pop();
                    else if (stationsInCity.has(fullPath[i].stationName) !== stationsInCity.has(fullPath[i + 1].stationName))
                        changingIdx.push(i);
                }
                if (changingIdx.length === 1 || changingIdx.length === 2) {
                    const applyCityRulePath = [
                        { "stationName": city.name, "lineName": fullPath[changingIdx[0]].lineName },
                        ...fullPath.slice(changingIdx[0] + 1)
                    ];
                    return applyCityRulePath;
                }
            }
        }
    }

    else {
        for (const city of cities) {
            const stationsInCity = new Set(city.stations);

            // 着駅適用
            if (stationsInCity.has(fullPath[fullPath.length - 1].stationName)) {
                const changingIdx: number[] = [];
                for (let i = 0; i < fullPath.length - 1; i++) {
                    if (i !== 0 &&
                        city.name === "大阪市内" &&
                        fullPath[i - 1].stationName === "加島" &&
                        fullPath[i].stationName === "尼崎" &&
                        fullPath[i + 1].stationName === "塚本")
                        changingIdx.pop();
                    else if (i !== 0 &&
                        city.name === "大阪市内" &&
                        fullPath[i - 1].stationName === "塚本" &&
                        fullPath[i].stationName === "尼崎" &&
                        fullPath[i + 1].stationName === "加島")
                        changingIdx.pop();
                    else if (i !== 0 &&
                        city.name === "大阪市内" &&
                        fullPath[i - 1].stationName === "加美" &&
                        fullPath[i].stationName === "久宝寺" &&
                        fullPath[i + 1].stationName === "新加美")
                        changingIdx.pop();
                    else if (i !== 0 &&
                        city.name === "大阪市内" &&
                        fullPath[i - 1].stationName === "新加美" &&
                        fullPath[i].stationName === "久宝寺" &&
                        fullPath[i + 1].stationName === "加美")
                        changingIdx.pop();
                    else if (stationsInCity.has(fullPath[i].stationName) !== stationsInCity.has(fullPath[i + 1].stationName))
                        changingIdx.push(i);

                }
                if (changingIdx.length === 1 || changingIdx.length === 2) {
                    const applyCityRulePath = [
                        ...fullPath.slice(0, changingIdx[changingIdx.length - 1] + 1),
                        { "stationName": city.name, "lineName": null }
                    ];
                    return applyCityRulePath;
                }
            }
        }
    }
    return null;
}

export function applyOneSideYamanoteRule(fullPath: PathStep[], direction: string): PathStep[] | null {
    const yamanote = load.getYamanote();
    const stationsInYamanote = new Set(yamanote.stations);

    if (direction === "forward") {
        // 発駅適用
        if (stationsInYamanote.has(fullPath[0].stationName)) {
            const changingIdx: number[] = [];
            for (let i = 0; i < fullPath.length - 1; i++) {
                if (stationsInYamanote.has(fullPath[i].stationName) !== stationsInYamanote.has(fullPath[i + 1].stationName))
                    changingIdx.push(i);
            }
            if (changingIdx.length === 1 || changingIdx.length === 2) {
                const applyCityRulePath = [
                    { "stationName": yamanote.name, "lineName": fullPath[changingIdx[0]].lineName },
                    ...fullPath.slice(changingIdx[0] + 1)
                ];
                return applyCityRulePath;
            }
        }
    }
    else {
        // 着駅適用
        if (stationsInYamanote.has(fullPath[fullPath.length - 1].stationName)) {
            const changingIdx: number[] = [];
            for (let i = 0; i < fullPath.length - 1; i++) {
                if (stationsInYamanote.has(fullPath[i].stationName) !== stationsInYamanote.has(fullPath[i + 1].stationName))
                    changingIdx.push(i);
            }
            if (changingIdx.length === 1 || changingIdx.length === 2) {
                const applyCityRulePath = [
                    ...fullPath.slice(0, changingIdx[changingIdx.length - 1] + 1),
                    { "stationName": yamanote.name, "lineName": null }
                ];
                return applyCityRulePath;
            }
        }
    }
    return null;
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
