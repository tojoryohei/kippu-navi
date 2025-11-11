import { load } from '@/components/load';
import { calculateTotalEigyoKilo, convertPathStepsToRouteSegments, createRouteKey } from '@/app/utils/calc';

import { PathStep, RouteSegment } from '@/app/types';

export function correctPath(fullPath: PathStep[]): PathStep[] {

    // 第69条 特定区間における旅客運賃・料金計算の営業キロ又は運賃計算キロ
    // fullPath = correctSpecificSections(fullPath);

    // 第70条 旅客が次に掲げる図の太線区間を通過する場合
    //fullPath = applyPassingBoldLineAreaRule(fullPath);

    // 第86条 特定都区市内にある駅に関連する片道普通旅客運賃の計算方
    fullPath = applyCityRule(fullPath);

    // 第87条 東京山手線内にある駅に関連する片道普通旅客運賃の計算方
    fullPath = applyYamanoteRule(fullPath);

    // 第88条 新大阪駅又は大阪駅発又は着となる片道普通旅客運賃の計算方
    fullPath = applyOsakaRule(fullPath);

    // 第89条 北新地駅発又は着となる片道普通旅客運賃の計算方
    fullPath = applyKitashinchiRule(fullPath);

    return fullPath;
}

function correctSpecificSections(fullPath: PathStep[]): PathStep[] {
    for (const rule of load.getSpecificSections()) {
        const { incorrectPath, correctPath } = rule;

        const startIndex = findSubPathIndex(fullPath, incorrectPath);

        if (startIndex !== -1) {
            const correctPathMiddleStations = correctPath.slice(1, -1).map(p => p.stationName);
            const pathOutsideSegment = [
                ...fullPath.slice(0, startIndex),
                ...fullPath.slice(startIndex + incorrectPath.length)
            ];

            const isStraddling = correctPathMiddleStations.some(
                correctStation => pathOutsideSegment.some(p => p.stationName === correctStation)
            );

            if (isStraddling === false) {
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

// 第70条 旅客が次に掲げる図の太線区間を通過する場合
function applyPassingBoldLineAreaRule(fullPath: PathStep[]) {
    const stationsInBoldLineArea = load.getTrainSpecificSections("電車大環状線");
    const changeIdx: number[] = [];

    for (let i = 0; i < fullPath.length - 2; i++) {
        const line0 = fullPath[i].lineName;
        const line1 = fullPath[i + 1].lineName;
        if (line0 === null || line1 === null) throw new Error(`applyBoldLineAreaRuleでエラーが発生しました.`);
        if (stationsInBoldLineArea.has(createRouteKey(line0, fullPath[i].stationName, fullPath[i + 1].stationName)) !==
            stationsInBoldLineArea.has(createRouteKey(line1, fullPath[i + 1].stationName, fullPath[i + 2].stationName)))
            changeIdx.push(i + 1);
    }
    if ((changeIdx.length === 3 || changeIdx.length === 4) &&
        stationsInBoldLineArea.has(createRouteKey(fullPath[0].lineName!, fullPath[0].stationName, fullPath[1].stationName)) === true)
        fullPath = [
            ...fullPath.slice(0, changeIdx[2]),
            { "stationName": fullPath[changeIdx[2]].stationName, "lineName": "ツウカ" },
            ...fullPath.slice(changeIdx[3])
        ]
    if ((changeIdx.length === 2 || changeIdx.length === 3) &&
        stationsInBoldLineArea.has(createRouteKey(fullPath[0].lineName!, fullPath[0].stationName, fullPath[1].stationName)) === false)
        fullPath = [
            ...fullPath.slice(0, changeIdx[0]),
            { "stationName": fullPath[changeIdx[0]].stationName, "lineName": "ツウカ" },
            ...fullPath.slice(changeIdx[1])
        ]
    return fullPath;
}

function findSubPathIndex(path: PathStep[], subPath: PathStep[]): number {
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
function applyCityRule(fullPath: PathStep[]): PathStep[] {
    const cities = load.getCities();
    const threshold: number = 2000;

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
                const routeSegments: RouteSegment[] = convertPathStepsToRouteSegments(applyCityRulePath);
                if (calculateTotalEigyoKilo(routeSegments) > threshold)
                    fullPath = applyCityRulePath;
            }
        }

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
                const routeSegments: RouteSegment[] = convertPathStepsToRouteSegments(applyCityRulePath);
                if (calculateTotalEigyoKilo(routeSegments) > threshold)
                    fullPath = applyCityRulePath;
            }
        }
    }
    return fullPath;
}

// 第87条 東京山手線内にある駅に関連する片道普通旅客運賃の計算方
function applyYamanoteRule(fullPath: PathStep[]): PathStep[] {
    const yamanote = load.getYamanote();
    const stationsInYamanote = new Set(yamanote.stations);
    const threshold: number = 1000;

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
            const routeSegments: RouteSegment[] = convertPathStepsToRouteSegments(applyCityRulePath);
            if (calculateTotalEigyoKilo(routeSegments) > threshold)
                fullPath = applyCityRulePath;
        }
    }

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
            const routeSegments: RouteSegment[] = convertPathStepsToRouteSegments(applyCityRulePath);
            if (calculateTotalEigyoKilo(routeSegments) > threshold)
                fullPath = applyCityRulePath;
        }
    }
    return fullPath;
}

// 第88条 新大阪駅又は大阪駅発又は着となる片道普通旅客運賃の計算方
function applyOsakaRule(fullPath: PathStep[]): PathStep[] {
    if (fullPath[0].stationName === "新大阪") {
        for (let i = 0; i < fullPath.length - 2; i++) {
            if (fullPath[i + 1].stationName === "東姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "姫路" &&
                fullPath[i + 2].lineName === null ||
                fullPath[i].stationName === "東姫路" &&
                fullPath[i].lineName === "サンヨ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "英賀保" ||
                fullPath[i].stationName === "東姫路" &&
                fullPath[i].lineName === "サンヨ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "ハンタ" &&
                fullPath[i + 2].stationName === "京口" ||
                fullPath[i].stationName === "東姫路" &&
                fullPath[i].lineName === "サンヨ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "キシン" &&
                fullPath[i + 2].stationName === "播磨高岡"
            )
                return [
                    { "stationName": "大阪・新大阪", "lineName": fullPath[1].lineName },
                    ...fullPath.slice(2)
                ]
        }
    }
    if (fullPath[0].stationName === "大阪") {
        for (let i = 0; i < fullPath.length - 2; i++) {
            if (fullPath[i + 1].stationName === "東姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "姫路" &&
                fullPath[i + 2].lineName === null ||
                fullPath[i].stationName === "東姫路" &&
                fullPath[i].lineName === "サンヨ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "英賀保" ||
                fullPath[i].stationName === "東姫路" &&
                fullPath[i].lineName === "サンヨ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "ハンタ" &&
                fullPath[i + 2].stationName === "京口" ||
                fullPath[i].stationName === "東姫路" &&
                fullPath[i].lineName === "サンヨ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "キシン" &&
                fullPath[i + 2].stationName === "播磨高岡"
            )
                return [
                    { "stationName": "大阪・新大阪", "lineName": fullPath[1].lineName },
                    ...fullPath.slice(1)
                ]
        }
    }
    if (fullPath[fullPath.length - 1].stationName === "新大阪") {
        if (fullPath[0].stationName === "姫路" &&
            fullPath[1].lineName === "サンヨ" &&
            fullPath[1].stationName === "東姫路"
        ) {
            return [
                ...fullPath.slice(0, fullPath.length - 2),
                { "stationName": "大阪・新大阪", "lineName": null }
            ]
        }
        for (let i = 0; i < fullPath.length - 2; i++) {
            if (
                fullPath[i].stationName === "英賀保" &&
                fullPath[i].lineName === "サンヨ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "東姫路" ||
                fullPath[i].stationName === "京口" &&
                fullPath[i].lineName === "ハンタ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "東姫路" ||
                fullPath[i].stationName === "播磨高岡" &&
                fullPath[i].lineName === "キシン" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "東姫路"
            )
                return [
                    ...fullPath.slice(0, fullPath.length - 2),
                    { "stationName": "大阪・新大阪", "lineName": null }
                ]
        }
    }
    if (fullPath[fullPath.length - 1].stationName === "大阪") {
        if (fullPath[0].stationName === "姫路" &&
            fullPath[1].lineName === "サンヨ" &&
            fullPath[1].stationName === "東姫路"
        ) {
            return [
                ...fullPath.slice(0, fullPath.length - 1),
                { "stationName": "大阪・新大阪", "lineName": null }
            ]
        }
        for (let i = 0; i < fullPath.length - 2; i++) {
            if (
                fullPath[i].stationName === "英賀保" &&
                fullPath[i].lineName === "サンヨ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "東姫路" ||
                fullPath[i].stationName === "京口" &&
                fullPath[i].lineName === "ハンタ" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "東姫路" ||
                fullPath[i].stationName === "播磨高岡" &&
                fullPath[i].lineName === "キシン" &&
                fullPath[i + 1].stationName === "姫路" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].stationName === "東姫路"
            )
                return [
                    ...fullPath.slice(0, fullPath.length - 1),
                    { "stationName": "大阪・新大阪", "lineName": null }
                ]
        }
    }
    return fullPath;
}

// 第89条 北新地駅発又は着となる片道普通旅客運賃の計算方
function applyKitashinchiRule(fullPath: PathStep[]): PathStep[] {
    let cnt = 0;
    if (fullPath.length === 6 &&
        fullPath[0].stationName === "北新地" &&
        fullPath[0].lineName === "トウサ" &&
        fullPath[1].stationName === "新福島" &&
        fullPath[1].lineName === "トウサ" &&
        fullPath[2].stationName === "海老江" &&
        fullPath[2].lineName === "トウサ" &&
        fullPath[3].stationName === "御幣島" &&
        fullPath[3].lineName === "トウサ" &&
        fullPath[4].stationName === "加島" &&
        fullPath[4].lineName === "トウサ" &&
        fullPath[5].stationName === "尼崎" ||
        fullPath.length > 6 &&
        fullPath[0].stationName === "北新地" &&
        fullPath[0].lineName === "トウサ" &&
        fullPath[1].stationName === "新福島" &&
        fullPath[1].lineName === "トウサ" &&
        fullPath[2].stationName === "海老江" &&
        fullPath[2].lineName === "トウサ" &&
        fullPath[3].stationName === "御幣島" &&
        fullPath[3].lineName === "トウサ" &&
        fullPath[4].stationName === "加島" &&
        fullPath[4].lineName === "トウサ" &&
        fullPath[5].stationName === "尼崎" &&
        fullPath[5].lineName === "トウカ" &&
        fullPath[6].stationName === "立花" ||
        fullPath.length > 6 &&
        fullPath[0].stationName === "北新地" &&
        fullPath[0].lineName === "トウサ" &&
        fullPath[1].stationName === "新福島" &&
        fullPath[1].lineName === "トウサ" &&
        fullPath[2].stationName === "海老江" &&
        fullPath[2].lineName === "トウサ" &&
        fullPath[3].stationName === "御幣島" &&
        fullPath[3].lineName === "トウサ" &&
        fullPath[4].stationName === "加島" &&
        fullPath[4].lineName === "トウサ" &&
        fullPath[5].stationName === "尼崎" &&
        fullPath[5].lineName === "フクチ" &&
        fullPath[6].stationName === "塚口"
    ) {
        fullPath = [
            { "stationName": "北新地", "lineName": "トウサ" },
            ...fullPath.slice(5)
        ]
    }

    if (fullPath.length === 6 &&
        fullPath[fullPath.length - 6].stationName === "尼崎" &&
        fullPath[fullPath.length - 6].lineName === "トウサ" &&
        fullPath[fullPath.length - 5].stationName === "加島" &&
        fullPath[fullPath.length - 5].lineName === "トウサ" &&
        fullPath[fullPath.length - 4].stationName === "御幣島" &&
        fullPath[fullPath.length - 4].lineName === "トウサ" &&
        fullPath[fullPath.length - 3].stationName === "海老江" &&
        fullPath[fullPath.length - 3].lineName === "トウサ" &&
        fullPath[fullPath.length - 2].stationName === "新福島" &&
        fullPath[fullPath.length - 2].lineName === "トウサ" &&
        fullPath[fullPath.length - 1].stationName === "北新地" ||
        fullPath.length > 6 &&
        fullPath[fullPath.length - 7].stationName === "立花" &&
        fullPath[fullPath.length - 7].lineName === "東海道" &&
        fullPath[fullPath.length - 6].stationName === "尼崎" &&
        fullPath[fullPath.length - 6].lineName === "トウサ" &&
        fullPath[fullPath.length - 5].stationName === "加島" &&
        fullPath[fullPath.length - 5].lineName === "トウサ" &&
        fullPath[fullPath.length - 4].stationName === "御幣島" &&
        fullPath[fullPath.length - 4].lineName === "トウサ" &&
        fullPath[fullPath.length - 3].stationName === "海老江" &&
        fullPath[fullPath.length - 3].lineName === "トウサ" &&
        fullPath[fullPath.length - 2].stationName === "新福島" &&
        fullPath[fullPath.length - 2].lineName === "トウサ" &&
        fullPath[fullPath.length - 1].stationName === "北新地" ||
        fullPath.length > 6 &&
        fullPath[fullPath.length - 7].stationName === "塚口" &&
        fullPath[fullPath.length - 7].lineName === "福知山線" &&
        fullPath[fullPath.length - 6].stationName === "尼崎" &&
        fullPath[fullPath.length - 6].lineName === "トウサ" &&
        fullPath[fullPath.length - 5].stationName === "加島" &&
        fullPath[fullPath.length - 5].lineName === "トウサ" &&
        fullPath[fullPath.length - 4].stationName === "御幣島" &&
        fullPath[fullPath.length - 4].lineName === "トウサ" &&
        fullPath[fullPath.length - 3].stationName === "海老江" &&
        fullPath[fullPath.length - 3].lineName === "トウサ" &&
        fullPath[fullPath.length - 2].stationName === "新福島" &&
        fullPath[fullPath.length - 2].lineName === "トウサ" &&
        fullPath[fullPath.length - 1].stationName === "北新地"
    ) {
        fullPath = [
            ...fullPath.slice(0, fullPath.length - 6),
            { "stationName": "尼崎", "lineName": "トウサ" },
            ...fullPath.slice(fullPath.length - 1, fullPath.length)
        ]
    }
    return fullPath;
}
