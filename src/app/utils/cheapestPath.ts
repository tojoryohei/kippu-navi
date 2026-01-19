import { load } from "@/app/utils/load";
import { loadSplit } from "@/app/split/lib/loadSplit";
import { calculateTotalEigyoKilo, calculateTotalGiseiKilo, convertPathStepsToRouteSegments, getFareForPath } from "@/app/utils/calc";
import { correctPath } from "@/app/utils/correctPath";

import { PathStep } from "@/app/types";

export function cheapestPath(fullPath: PathStep[]): PathStep[] {

    const correctedPath = correctPath(fullPath);

    let cheapestPath = extendFromCity(correctedPath);
    let cheapestFare = getFareForPath(cheapestPath);

    // Start Extension
    const startExtentionPath = extendTheFrontOfSections(correctedPath);
    if (startExtentionPath !== null) {
        const extentionPath = [...startExtentionPath, ...correctedPath];
        const extentionFare = getFareForPath(extendFromCity(extentionPath));
        if (extentionFare < cheapestFare) {
            cheapestPath = extentionPath;
            cheapestFare = extentionFare;
        }
    }

    // Goal Extension
    const goalExtentionPath = extendTheRearOfSections(correctedPath);
    if (goalExtentionPath !== null) {
        const extentionPath = [...correctedPath.slice(0, -1), ...goalExtentionPath];
        const extentionFare = getFareForPath(extendFromCity(extentionPath));
        if (extentionFare < cheapestFare) {
            cheapestPath = extentionPath;
            cheapestFare = extentionFare;
        }
    }

    // Dual Extension
    if (startExtentionPath !== null && goalExtentionPath !== null) {
        const dualExtentionPath = [...startExtentionPath, ...correctedPath.slice(0, -1), ...goalExtentionPath];
        const dualExtentionFare = getFareForPath(extendFromCity(dualExtentionPath));
        if (dualExtentionFare < cheapestFare) {
            cheapestPath = dualExtentionPath;
            cheapestFare = dualExtentionFare;
        }
    }

    return cheapestPath;
}

/**
 * 第114条（および第87条関連）適用メイン関数
 */
export function extendFromCity(originalPath: PathStep[]): PathStep[] {
    // パスが短すぎる場合は無視
    if (!originalPath || originalPath.length < 2) return originalPath;

    // -------------------------------------------------------------
    // 手順1: 入力経路の距離チェック (足切り)
    // -------------------------------------------------------------
    const currentSegments = convertPathStepsToRouteSegments(originalPath);
    const currentDistance = calculateTotalGiseiKilo(currentSegments);

    // 発着駅が山手線内にあるか確認して足切りラインを決定
    // 山手線内駅が含まれる場合は120km(1200)、それ以外は220km(2200)
    const yamanote = load.getYamanote();
    const stationsInYamanote = new Set(yamanote.stations);
    const startInYamanote = stationsInYamanote.has(originalPath[0].stationName);
    const endInYamanote = stationsInYamanote.has(originalPath[originalPath.length - 1].stationName);

    const pruneLimit = (startInYamanote || endInYamanote) ? 1200 : 2200;

    if (currentDistance <= pruneLimit) {
        return originalPath;
    }

    let bestPath = [...originalPath];
    let minFare = getFareForPath(originalPath);

    // -------------------------------------------------------------
    // 探索実行: 山手線ルール(100km) と 特定都区市内ルール(200km) の両方を試す
    // -------------------------------------------------------------

    // ヘルパー: 試行と最安値更新
    const tryUpdate = (path: PathStep[]) => {
        const fare = getFareForPath(path);
        if (fare < minFare) {
            minFare = fare;
            bestPath = path;
        }
    };

    // 1. 東京山手線内ルールでの探索 (閾値 1000 = 100.0km)
    // 発駅側
    tryUpdate(tryExtension(originalPath, "forward", 1000, applyOneSideYamanoteRule));
    // 着駅側
    tryUpdate(tryExtension(originalPath, "backward", 1000, applyOneSideYamanoteRule));

    // 2. 特定都区市内ルールでの探索 (閾値 2000 = 200.0km)
    // 発駅側
    tryUpdate(tryExtension(originalPath, "forward", 2000, applyOneSideCityRule));
    // 着駅側
    tryUpdate(tryExtension(originalPath, "backward", 2000, applyOneSideCityRule));

    return bestPath;
}

/**
 * 指定されたルールと閾値に基づいて延伸探索を行うヘルパー関数
 * 手順2〜5の実装
 */
function tryExtension(
    basePath: PathStep[],
    direction: 'forward' | 'backward',
    threshold: number,
    ruleFunc: (path: PathStep[], dir: string) => PathStep[] | null
): PathStep[] {

    // 手順2/4: 発駅(または着駅)が特定市内か？ また中心駅からの距離が既に閾値超か？
    const ruleAppliedPath = ruleFunc(basePath, direction);

    if (!ruleAppliedPath) {
        // 特定市内ではない -> 何もしない (元のパスを返す)
        return basePath;
    }

    // 中心駅からの距離を測定
    const segments = convertPathStepsToRouteSegments(ruleAppliedPath);
    const distFromCenter = calculateTotalEigyoKilo(segments);

    if (distFromCenter > threshold) {
        // 既に200.0km(100.0km)を超えている -> break (探索しない)
        return basePath;
    }

    // 手順3/5: 先へ伸ばしていき、初めて閾値を超えた駅を探す
    return searchExtension(basePath, direction, threshold, ruleFunc);
}

/**
 * 延伸探索関数 (BFS)
 * 提供されたルール関数を使って中心駅からの距離を判定する
 */
function searchExtension(
    basePath: PathStep[],
    direction: 'forward' | 'backward',
    threshold: number,
    ruleFunc: (path: PathStep[], dir: string) => PathStep[] | null
): PathStep[] {

    let bestExtendedPath = [...basePath];
    // 初期運賃は無限大にしておく（必ず条件を満たした先の運賃を採用するため）
    // ただし、見つからなかった場合は元のパスを返す必要があるため、呼び出し元で制御
    let bestExtendedFare = Infinity;
    let found = false;

    const queue: { path: PathStep[], depth: number }[] = [{ path: [...basePath], depth: 0 }];
    const MAX_DEPTH = 10;
    const visitedStations = new Set<string>();
    basePath.forEach(p => visitedStations.add(p.stationName));

    while (queue.length > 0) {
        const { path: currentPath, depth } = queue.shift()!;

        // 1. ルールを強制適用して中心駅からの距離を測る
        const ruleAppliedPath = ruleFunc(currentPath, direction);

        // そもそもルール適用対象外の駅（市外へ出たなど）になったら、このルートは無効
        // ただし applyOneSideCityRule は市外に出ると null を返す仕様と想定されるためチェック
        if (ruleAppliedPath) {
            const segments = convertPathStepsToRouteSegments(ruleAppliedPath);
            const distFromCenter = calculateTotalEigyoKilo(segments);

            // 2. 判定: 中心駅からの距離が閾値を超えたか？
            if (distFromCenter > threshold) {
                // 初めて超えた駅で運賃計算
                const fare = getFareForPath(currentPath);

                // 比較適用
                if (fare < bestExtendedFare) {
                    bestExtendedFare = fare;
                    bestExtendedPath = currentPath;
                    found = true;
                }

                // これ以上伸ばしても距離が増えるだけなので終了
                continue;
            }
        }

        // --- 閾値を超えていない場合は探索継続 ---

        if (depth >= MAX_DEPTH) continue;

        // 次の駅へ
        let searchNodeName = "";
        if (direction === 'forward') {
            searchNodeName = currentPath[currentPath.length - 1].stationName;
        } else {
            searchNodeName = currentPath[0].stationName;
        }

        const neighbors = loadSplit.getNeighbors(searchNodeName);

        for (const neighborName of neighbors) {
            if (visitedStations.has(neighborName)) continue;
            if (currentPath.some(p => p.stationName === neighborName)) continue;

            const segmentsInfo = loadSplit.getSegmentsForStationPair(searchNodeName, neighborName);
            if (segmentsInfo.length === 0) continue;

            const lineName = segmentsInfo[0].line;

            let newPath: PathStep[];
            if (direction === 'forward') {
                const prevPath = JSON.parse(JSON.stringify(currentPath));
                if (prevPath.length > 0) {
                    prevPath[prevPath.length - 1].lineName = lineName;
                }
                newPath = [...prevPath, { stationName: neighborName, lineName: null }];
            } else {
                newPath = [{ stationName: neighborName, lineName: lineName }, ...currentPath];
            }
            queue.push({ path: newPath, depth: depth + 1 });
        }
    }

    return found ? bestExtendedPath : basePath;
}

function applyOneSideCityRule(fullPath: PathStep[], direction: string): PathStep[] | null {
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

function applyOneSideYamanoteRule(fullPath: PathStep[], direction: string): PathStep[] | null {
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

export function extendTheFrontOfSections(path: PathStep[]): PathStep[] | null {
    if (path.length < 2) return null;
    const outerSpecificSections = load.getSpecificSections();
    for (const outerSpecificSection of outerSpecificSections) {
        const idx0 = outerSpecificSection.stations.indexOf(path[0].stationName)
        const idx1 = outerSpecificSection.stations.indexOf(path[1].stationName)
        if (0 < idx0 && idx0 + 1 === idx1)
            return outerSpecificSection.routes.slice(0, idx0)
    }
    return null;
}

export function extendTheRearOfSections(path: PathStep[]): PathStep[] | null {
    if (path.length < 2) return null;
    const outerSpecificSections = load.getSpecificSections();
    for (const outerSpecificSection of outerSpecificSections) {
        const idx0 = outerSpecificSection.stations.indexOf(path[path.length - 2].stationName)
        const idx1 = outerSpecificSection.stations.indexOf(path[path.length - 1].stationName)
        if (0 <= idx0 && idx0 + 1 === idx1 && idx1 < outerSpecificSection.stations.length - 1)
            return outerSpecificSection.routes.slice(idx1)
    }
    return null;
}
