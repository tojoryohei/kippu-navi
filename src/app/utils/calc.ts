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
    if (fullPath.length < 2) return [];

    const viaLines: string[] = [];
    const printedViaLines: string[] = [];
    const SHINKANSEN_LINES: Set<string> = new Set(["カタシ", "キタシ", "キユシ", "シヨシ", "シンカ", "トホシ", "ニキシ", "ホクシ"]);
    const SHINKANSEN_STATIONS: Set<string> = new Set(["仙台市内", "横浜市内", "名古屋市内", "京都市内", "大阪市内", "神戸市内", "広島市内", "北九州市内", "福岡市内", "（北）福島", "米沢", "高畠", "赤湯", "かみのやま温泉", "山形", "北山形", "羽前千歳", "天童", "さくらんぼ東根", "村山", "大石田", "新庄", "新青森", "奥津軽いまべつ", "木古内", "新函館北斗", "博多", "新鳥栖", "久留米", "筑後船小屋", "新大牟田", "新玉名", "熊本", "新八代", "新水俣", "出水", "（鹿）川内", "鹿児島中央", "東京", "上野", "大宮", "熊谷", "本庄早稲田", "高崎", "上毛高原", "越後湯沢", "浦佐", "長岡", "燕三条", "新潟", "東京", "品川", "新横浜", "小田原", "熱海", "三島", "（東）新富士", "静岡", "掛川", "浜松", "豊橋", "三河安城", "名古屋", "岐阜羽島", "米原", "京都", "新大阪", "新神戸", "西明石", "姫路", "相生", "岡山", "新倉敷", "福山", "新尾道", "三原", "東広島", "広島", "新岩国", "徳山", "新山口", "厚狭", "新下関", "小倉", "博多", "東京", "上野", "大宮", "小山", "宇都宮", "那須塩原", "新白河", "（北）郡山", "（北）福島", "白石蔵王", "仙台", "古川", "くりこま高原", "一ノ関", "水沢江刺", "北上", "新花巻", "盛岡", "いわて沼宮内", "二戸", "八戸", "七戸十和田", "新青森", "武雄温泉", "嬉野温泉", "新大村", "諫早", "長崎", "東京", "上野", "大宮", "熊谷", "本庄早稲田", "高崎", "安中榛名", "軽井沢", "佐久平", "上田", "長野", "飯山", "上越妙高", "糸魚川", "黒部宇奈月温泉", "富山", "新高岡", "金沢", "小松", "加賀温泉", "芦原温泉", "福井", "越前たけふ", "敦賀"]);

    for (let i = 0; i < fullPath.length; i++) {
        const station = fullPath[i].stationName;
        if (station === null) continue;
        const prevLine = 0 < viaLines.length ? viaLines[viaLines.length - 1] : null;
        const line = fullPath[i].lineName;
        if (line === null) {
            if (prevLine !== null && SHINKANSEN_LINES.has(prevLine) && SHINKANSEN_STATIONS.has(station))
                if (station === "仙台市内")
                    printedViaLines.push("仙台");
                else if (station === "横浜市内")
                    printedViaLines.push("新横浜");
                else if (station === "名古屋市内")
                    printedViaLines.push("名古屋");
                else if (station === "京都市内")
                    printedViaLines.push("京都");
                else if (station === "大阪市内")
                    printedViaLines.push("新大阪");
                else if (station === "神戸市内")
                    printedViaLines.push("新神戸");
                else if (station === "広島市内")
                    printedViaLines.push("広島");
                else if (station === "北九州市内")
                    printedViaLines.push("小倉");
                else if (station === "福岡市内")
                    printedViaLines.push("博多");
                else
                    printedViaLines.push(station); //最後の駅が新幹線駅
            break;
        }
        const printing = load.getPrinting(line);
        if (prevLine !== null && prevLine !== line) {
            if ((SHINKANSEN_LINES.has(line) || SHINKANSEN_LINES.has(prevLine)) && SHINKANSEN_STATIONS.has(station))
                printedViaLines.push(station);
            if (printing === null) continue;
            viaLines.push(line);
            printedViaLines.push(printing);
        }
        else if (station === "京橋" && line === "オオサ１")
            printedViaLines.push("京橋");
        else if (station === "西九条" && line === "オオサ２")
            printedViaLines.push("西九条");
        else if (prevLine === null) {
            if (SHINKANSEN_LINES.has(line) && SHINKANSEN_STATIONS.has(station))
                if (station === "仙台市内")
                    printedViaLines.push("仙台");
                else if (station === "横浜市内")
                    printedViaLines.push("新横浜");
                else if (station === "名古屋市内")
                    printedViaLines.push("名古屋");
                else if (station === "京都市内")
                    printedViaLines.push("京都");
                else if (station === "大阪市内")
                    printedViaLines.push("新大阪");
                else if (station === "神戸市内")
                    printedViaLines.push("新神戸");
                else if (station === "広島市内")
                    printedViaLines.push("広島");
                else if (station === "北九州市内")
                    printedViaLines.push("小倉");
                else if (station === "福岡市内")
                    printedViaLines.push("博多");
                else
                    printedViaLines.push(station); //最初の駅が新幹線駅
            if (printing === null) continue;
            viaLines.push(line);
            printedViaLines.push(printing);
        }
    }
    return printedViaLines;
}
