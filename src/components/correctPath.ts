import { load } from "@/components/load";
import { calculateTotalEigyoKilo, convertPathStepsToRouteSegments, createRouteKey } from "@/app/utils/calc";

import { PathStep, RouteSegment } from "@/app/types";

export function correctPath(fullPath: PathStep[]): PathStep[] {

    // 第69条 特定区間における旅客運賃・料金計算の営業キロ又は運賃計算キロ
    fullPath = correctSpecificSections(fullPath);

    // 第70条 旅客が次に掲げる図の太線区間を通過する場合
    // 第160条 特定区間発着の場合のう回乗車
    fullPath = applyBoldLineAreaRule(fullPath);

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

// 第69条 特定区間における旅客運賃・料金計算の営業キロ又は運賃計算キロ
function correctSpecificSections(fullPath: PathStep[]): PathStep[] {
    const stationsOnFullPath = new Set<string>();
    for (const path of fullPath) {
        stationsOnFullPath.add(path.stationName);
    }

    // （1）大沼以遠（仁山方面）の各駅と、森以遠（石倉方面）の各駅との相互間
    if (stationsOnFullPath.has("渡島砂原") === true &&
        stationsOnFullPath.has("大沼公園") === false &&
        stationsOnFullPath.has("赤井川") === false &&
        stationsOnFullPath.has("駒ケ岳") === false
    ) {
        for (let i = 0; i < fullPath.length - 7; i++) {
            if (fullPath[i + 0].stationName === "大沼" &&
                fullPath[i + 1].stationName === "鹿部" &&
                fullPath[i + 2].stationName === "渡島沼尻" &&
                fullPath[i + 3].stationName === "渡島砂原" &&
                fullPath[i + 4].stationName === "掛澗" &&
                fullPath[i + 5].stationName === "尾白内" &&
                fullPath[i + 6].stationName === "東森" &&
                fullPath[i + 7].stationName === "森" &&
                fullPath[i + 0].lineName === "ハコタ２" &&
                fullPath[i + 1].lineName === "ハコタ２" &&
                fullPath[i + 2].lineName === "ハコタ２" &&
                fullPath[i + 3].lineName === "ハコタ２" &&
                fullPath[i + 4].lineName === "ハコタ２" &&
                fullPath[i + 5].lineName === "ハコタ２" &&
                fullPath[i + 6].lineName === "ハコタ２"
            ) {

                const idx = i;

                // 大沼→森
                if (idx === 0 &&
                    7 < fullPath.length &&
                    fullPath[7].lineName === null
                ) {
                    fullPath = [
                        { stationName: "大沼", lineName: "ホセイ" },
                        { stationName: "大沼公園", lineName: "ホセイ" },
                        { stationName: "赤井川", lineName: "ホセイ" },
                        { stationName: "駒ケ岳", lineName: "ホセイ" },
                        ...fullPath.slice(7)
                    ]
                    break;
                }

                // 大沼→石倉方面
                if (idx === 0 &&
                    8 < fullPath.length &&
                    fullPath[7].lineName === "ハコタ" &&
                    fullPath[8].stationName === "石倉"
                ) {
                    fullPath = [
                        { stationName: "大沼", lineName: "ホセイ" },
                        { stationName: "大沼公園", lineName: "ホセイ" },
                        { stationName: "赤井川", lineName: "ホセイ" },
                        { stationName: "駒ケ岳", lineName: "ホセイ" },
                        ...fullPath.slice(7)
                    ]
                    break;
                }

                // 仁山方面→森
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "仁山" &&
                    fullPath[idx - 1].lineName === "ハコタ" &&
                    fullPath[idx + 7].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大沼", lineName: "ホセイ" },
                        { stationName: "大沼公園", lineName: "ホセイ" },
                        { stationName: "赤井川", lineName: "ホセイ" },
                        { stationName: "駒ケ岳", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 7)
                    ]
                    break;
                }

                // 仁山方面→石倉方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "仁山" &&
                    fullPath[idx - 1].lineName === "ハコタ" &&
                    idx + 8 < fullPath.length &&
                    fullPath[idx + 7].lineName === "ハコタ" &&
                    fullPath[idx + 8].stationName === "石倉"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大沼", lineName: "ホセイ" },
                        { stationName: "大沼公園", lineName: "ホセイ" },
                        { stationName: "赤井川", lineName: "ホセイ" },
                        { stationName: "駒ケ岳", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 7)
                    ]
                    break;
                }
            }
        }
        for (let i = 0; i < fullPath.length - 7; i++) {
            if (fullPath[i + 0].stationName === "森" &&
                fullPath[i + 1].stationName === "東森" &&
                fullPath[i + 2].stationName === "尾白内" &&
                fullPath[i + 3].stationName === "掛澗" &&
                fullPath[i + 4].stationName === "渡島砂原" &&
                fullPath[i + 5].stationName === "渡島沼尻" &&
                fullPath[i + 6].stationName === "鹿部" &&
                fullPath[i + 7].stationName === "大沼" &&
                fullPath[i + 0].lineName === "ハコタ２" &&
                fullPath[i + 1].lineName === "ハコタ２" &&
                fullPath[i + 2].lineName === "ハコタ２" &&
                fullPath[i + 3].lineName === "ハコタ２" &&
                fullPath[i + 4].lineName === "ハコタ２" &&
                fullPath[i + 5].lineName === "ハコタ２" &&
                fullPath[i + 6].lineName === "ハコタ２"
            ) {
                const idx = i;

                // 森→大沼
                if (idx === 0 &&
                    fullPath[7].lineName === null
                ) {
                    fullPath = [
                        { stationName: "森", lineName: "ホセイ" },
                        { stationName: "駒ケ岳", lineName: "ホセイ" },
                        { stationName: "赤井川", lineName: "ホセイ" },
                        { stationName: "大沼公園", lineName: "ホセイ" },
                        ...fullPath.slice(7)
                    ]
                    break;
                }

                // 森→仁山方面
                if (idx === 0 &&
                    8 < fullPath.length &&
                    fullPath[7].lineName === "ハコタ" &&
                    fullPath[8].stationName === "仁山"
                ) {
                    fullPath = [
                        { stationName: "森", lineName: "ホセイ" },
                        { stationName: "駒ケ岳", lineName: "ホセイ" },
                        { stationName: "赤井川", lineName: "ホセイ" },
                        { stationName: "大沼公園", lineName: "ホセイ" },
                        ...fullPath.slice(7)
                    ]
                    break;
                }

                // 石倉方面→大沼
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "石倉" &&
                    fullPath[idx - 1].lineName === "ハコタ" &&
                    fullPath[idx + 7].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "森", lineName: "ホセイ" },
                        { stationName: "駒ケ岳", lineName: "ホセイ" },
                        { stationName: "赤井川", lineName: "ホセイ" },
                        { stationName: "大沼公園", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 7)
                    ]
                    break;
                }

                // 石倉方面→仁山方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "石倉" &&
                    fullPath[idx - 1].lineName === "ハコタ" &&
                    idx + 8 < fullPath.length &&
                    fullPath[idx + 7].lineName === "ハコタ" &&
                    fullPath[idx + 8].stationName === "仁山"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "森", lineName: "ホセイ" },
                        { stationName: "駒ケ岳", lineName: "ホセイ" },
                        { stationName: "赤井川", lineName: "ホセイ" },
                        { stationName: "大沼公園", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 7)
                    ]
                    break;
                }
            }
        }
    }

    // （2）日暮里以遠（鶯谷又は三河島方面）の各駅と、赤羽以遠（川口、北赤羽又は十条方面）の各駅との相互間
    if (stationsOnFullPath.has("尾久") === true &&
        stationsOnFullPath.has("西日暮里") === false &&
        stationsOnFullPath.has("田端") === false &&
        stationsOnFullPath.has("上中里") === false &&
        stationsOnFullPath.has("王子") === false &&
        stationsOnFullPath.has("東十条") === false
    ) {
        for (let i = 0; i < fullPath.length - 2; i++) {
            if (fullPath[i + 0].stationName === "日暮里" &&
                fullPath[i + 1].stationName === "尾久" &&
                fullPath[i + 2].stationName === "赤羽" &&
                (fullPath[i + 0].lineName === "トウホ" || fullPath[i + 0].lineName === "オク") &&
                (fullPath[i + 1].lineName === "トウホ" || fullPath[i + 1].lineName === "オク")
            ) {

                const idx = i;

                // 日暮里→赤羽
                if (idx === 0 &&
                    2 < fullPath.length &&
                    fullPath[2].lineName === null
                ) {
                    fullPath = [
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(2)
                    ]
                    break;
                }

                // 日暮里→川口方面
                if (idx === 0 &&
                    3 < fullPath.length &&
                    (fullPath[2].lineName === "トウホ" || fullPath[2].lineName === "ホセイ") &&
                    fullPath[3].stationName === "川口"
                ) {
                    fullPath = [
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(2)
                    ]
                    break;
                }

                // 日暮里→北赤羽方面
                if (idx === 0 &&
                    3 < fullPath.length &&
                    (fullPath[2].lineName === "トウホ４" || fullPath[2].lineName === "トウホア") &&
                    fullPath[3].stationName === "北赤羽"
                ) {
                    fullPath = [
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(2)
                    ]
                    break;
                }

                // 日暮里→十条方面
                if (idx === 0 &&
                    3 < fullPath.length &&
                    (fullPath[2].lineName === "アカハ" || fullPath[2].lineName === "アカハネ") &&
                    fullPath[3].stationName === "十条"
                ) {
                    fullPath = [
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(2)
                    ]
                    break;
                }

                // 鶯谷方面→赤羽
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "鶯谷" &&
                    fullPath[idx - 1].lineName === "トウホ" &&
                    idx + 2 < fullPath.length &&
                    fullPath[idx + 2].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 鶯谷方面→川口方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "鶯谷" &&
                    fullPath[idx - 1].lineName === "トウホ" &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "トウホ" || fullPath[idx + 2].lineName === "ホセイ") &&
                    fullPath[idx + 3].stationName === "川口"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 鶯谷方面→北赤羽方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "鶯谷" &&
                    fullPath[idx - 1].lineName === "トウホ" &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "トウホ４" || fullPath[idx + 2].lineName === "トウホア") &&
                    fullPath[idx + 3].stationName === "北赤羽"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 鶯谷方面→十条方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "鶯谷" &&
                    fullPath[idx - 1].lineName === "トウホ" &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "アカハ" || fullPath[idx + 2].lineName === "アカハネ") &&
                    fullPath[idx + 3].stationName === "十条"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 三河島方面→赤羽
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "三河島" &&
                    (fullPath[idx - 1].lineName === "シヨハ" || fullPath[idx - 1].lineName === "シヨハニ") &&
                    idx + 2 < fullPath.length &&
                    fullPath[idx + 2].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 三河島方面→川口方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "三河島" &&
                    (fullPath[idx - 1].lineName === "シヨハ" || fullPath[idx - 1].lineName === "シヨハニ") &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "トウホ" || fullPath[idx + 2].lineName === "ホセイ") &&
                    fullPath[idx + 3].stationName === "川口"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 三河島方面→北赤羽方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "三河島" &&
                    (fullPath[idx - 1].lineName === "シヨハ" || fullPath[idx - 1].lineName === "シヨハニ") &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "トウホ４" || fullPath[idx + 2].lineName === "トウホア") &&
                    fullPath[idx + 3].stationName === "北赤羽"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 三河島方面→十条方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "三河島" &&
                    (fullPath[idx - 1].lineName === "シヨハ" || fullPath[idx - 1].lineName === "シヨハニ") &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "アカハ" || fullPath[idx + 2].lineName === "アカハネ") &&
                    fullPath[idx + 3].stationName === "十条"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "日暮里", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }
            }
        }

        for (let i = 0; i < fullPath.length - 2; i++) {
            if (fullPath[i + 0].stationName === "赤羽" &&
                fullPath[i + 1].stationName === "尾久" &&
                fullPath[i + 2].stationName === "日暮里" &&
                (fullPath[i + 0].lineName === "トウホ" || fullPath[i + 0].lineName === "オク") &&
                (fullPath[i + 1].lineName === "トウホ" || fullPath[i + 1].lineName === "オク")
            ) {
                const idx = i;

                // 赤羽→日暮里
                if (idx === 0 &&
                    2 < fullPath.length &&
                    fullPath[2].lineName === null
                ) {
                    fullPath = [
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(2)
                    ]
                    break;
                }

                // 赤羽→鶯谷方面
                if (idx === 0 &&
                    3 < fullPath.length &&
                    fullPath[2].lineName === "トウホ" &&
                    fullPath[3].stationName === "鶯谷"
                ) {
                    fullPath = [
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(2)
                    ]
                    break;
                }

                // 赤羽→三河島方面
                if (idx === 0 &&
                    3 < fullPath.length &&
                    (fullPath[2].lineName === "シヨハ" || fullPath[2].lineName === "シヨハニ") &&
                    fullPath[3].stationName === "三河島"
                ) {
                    fullPath = [
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(2)
                    ]
                    break;
                }

                // 川口方面→日暮里
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "川口" &&
                    (fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "ホセイ") &&
                    idx + 2 < fullPath.length &&
                    fullPath[idx + 2].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 川口方面→鶯谷方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "川口" &&
                    (fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "ホセイ") &&
                    idx + 3 < fullPath.length &&
                    fullPath[idx + 2].lineName === "トウホ" &&
                    fullPath[idx + 3].stationName === "鶯谷"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 川口方面→三河島方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "川口" &&
                    (fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "ホセイ") &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "シヨハ" || fullPath[idx + 2].lineName === "シヨハニ") &&
                    fullPath[idx + 3].stationName === "三河島"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 北赤羽方面→日暮里
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "北赤羽" &&
                    (fullPath[idx - 1].lineName === "トウホ４" || fullPath[idx - 1].lineName === "トウホア") &&
                    idx + 2 < fullPath.length &&
                    fullPath[idx + 2].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 北赤羽方面→鶯谷方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "北赤羽" &&
                    (fullPath[idx - 1].lineName === "トウホ４" || fullPath[idx - 1].lineName === "トウホア") &&
                    idx + 3 < fullPath.length &&
                    fullPath[idx + 2].lineName === "トウホ" &&
                    fullPath[idx + 3].stationName === "鶯谷"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 北赤羽方面→三河島方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "北赤羽" &&
                    (fullPath[idx - 1].lineName === "トウホ４" || fullPath[idx - 1].lineName === "トウホア") &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "シヨハ" || fullPath[idx + 2].lineName === "シヨハニ") &&
                    fullPath[idx + 3].stationName === "三河島"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 十条方面→日暮里
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "十条" &&
                    (fullPath[idx - 1].lineName === "アカハ" || fullPath[idx - 1].lineName === "アカハネ") &&
                    idx + 2 < fullPath.length &&
                    fullPath[idx + 2].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 十条方面→鶯谷方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "十条" &&
                    (fullPath[idx - 1].lineName === "アカハ" || fullPath[idx - 1].lineName === "アカハネ") &&
                    idx + 3 < fullPath.length &&
                    fullPath[idx + 2].lineName === "トウホ" &&
                    fullPath[idx + 3].stationName === "鶯谷"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "東十条", lineName: "ホセイ" },
                        { stationName: "王子", lineName: "ホセイ" },
                        { stationName: "上中里", lineName: "ホセイ" },
                        { stationName: "田端", lineName: "ホセイ" },
                        { stationName: "西日暮里", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }

                // 十条方面→三河島方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "十条" &&
                    (fullPath[idx - 1].lineName === "アカハ" || fullPath[idx - 1].lineName === "アカハネ") &&
                    idx + 3 < fullPath.length &&
                    (fullPath[idx + 2].lineName === "シヨハ" || fullPath[idx + 2].lineName === "シヨハニ") &&
                    fullPath[idx + 3].stationName === "三河島"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 2)
                    ]
                    break;
                }
            }
        }
    }

    // （3）赤羽以遠（尾久、東十条又は十条方面）の各駅と、大宮以遠（土呂、宮原又は日進方面）の各駅との相互間
    if (stationsOnFullPath.has("武蔵浦和") === true &&
        stationsOnFullPath.has("川口") === false &&
        stationsOnFullPath.has("西川口") === false &&
        stationsOnFullPath.has("蕨") === false &&
        stationsOnFullPath.has("南浦和") === false &&
        stationsOnFullPath.has("浦和") === false &&
        stationsOnFullPath.has("北浦和") === false &&
        stationsOnFullPath.has("与野") === false &&
        stationsOnFullPath.has("さいたま新都心") === false
    ) {
        for (let i = 0; i < fullPath.length - 11; i++) {
            if (fullPath[i + 0].stationName === "赤羽" &&
                fullPath[i + 1].stationName === "北赤羽" &&
                fullPath[i + 2].stationName === "浮間舟渡" &&
                fullPath[i + 3].stationName === "戸田公園" &&
                fullPath[i + 4].stationName === "（東）戸田" &&
                fullPath[i + 5].stationName === "北戸田" &&
                fullPath[i + 6].stationName === "武蔵浦和" &&
                fullPath[i + 7].stationName === "中浦和" &&
                fullPath[i + 8].stationName === "南与野" &&
                fullPath[i + 9].stationName === "与野本町" &&
                fullPath[i + 10].stationName === "北与野" &&
                fullPath[i + 11].stationName === "大宮" &&
                (fullPath[i + 0].lineName === "トウホ４" || fullPath[i + 0].lineName === "トウホア") &&
                (fullPath[i + 1].lineName === "トウホ４" || fullPath[i + 1].lineName === "トウホア" || fullPath[i + 1].lineName === "トウホオ") &&
                (fullPath[i + 2].lineName === "トウホ４" || fullPath[i + 2].lineName === "トウホア" || fullPath[i + 2].lineName === "トウホオ") &&
                (fullPath[i + 3].lineName === "トウホ４" || fullPath[i + 3].lineName === "トウホア" || fullPath[i + 3].lineName === "トウホオ") &&
                (fullPath[i + 4].lineName === "トウホ４" || fullPath[i + 4].lineName === "トウホア" || fullPath[i + 4].lineName === "トウホオ") &&
                (fullPath[i + 5].lineName === "トウホ４" || fullPath[i + 5].lineName === "トウホア" || fullPath[i + 5].lineName === "トウホオ") &&
                (fullPath[i + 6].lineName === "トウホ４" || fullPath[i + 6].lineName === "トウホア" || fullPath[i + 6].lineName === "トウホオ") &&
                (fullPath[i + 7].lineName === "トウホ４" || fullPath[i + 7].lineName === "トウホア" || fullPath[i + 7].lineName === "トウホオ") &&
                (fullPath[i + 8].lineName === "トウホ４" || fullPath[i + 8].lineName === "トウホア" || fullPath[i + 8].lineName === "トウホオ") &&
                (fullPath[i + 9].lineName === "トウホ４" || fullPath[i + 9].lineName === "トウホア" || fullPath[i + 9].lineName === "トウホオ") &&
                (fullPath[i + 10].lineName === "トウホ４" || fullPath[i + 10].lineName === "トウホオ")
            ) {
                const idx = i;

                // 赤羽→大宮
                if (idx === 0 &&
                    11 < fullPath.length &&
                    fullPath[11].lineName === null
                ) {
                    fullPath = [
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(11)
                    ]
                    break;
                }

                // 赤羽→土呂方面
                if (idx === 0 &&
                    12 < fullPath.length &&
                    fullPath[11].lineName === "トウホ" &&
                    fullPath[12].stationName === "土呂"
                ) {
                    fullPath = [
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(11)
                    ]
                    break;
                }

                // 赤羽→宮原方面
                if (idx === 0 &&
                    12 < fullPath.length &&
                    fullPath[11].lineName === "タカサ" &&
                    fullPath[12].stationName === "宮原"
                ) {
                    fullPath = [
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(11)
                    ]
                    break;

                }

                // 赤羽→日進方面
                if (idx === 0 &&
                    12 < fullPath.length &&
                    fullPath[11].lineName === "カワコ" &&
                    fullPath[12].stationName === "（川）日進"
                ) {
                    fullPath = [
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(11)
                    ]
                    break;

                }

                // 尾久方面→大宮
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "尾久" &&
                    (fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "オク") &&
                    idx + 11 < fullPath.length &&
                    fullPath[idx + 11].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 尾久方面→土呂方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "尾久" &&
                    (fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "オク") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "トウホ" &&
                    fullPath[idx + 12].stationName === "土呂"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 尾久方面→宮原方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "尾久" &&
                    (fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "オク") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "タカサ" &&
                    fullPath[idx + 12].stationName === "宮原"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 尾久方面→日進方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "尾久" &&
                    (fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "オク") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "カワコ" &&
                    fullPath[idx + 12].stationName === "（川）日進"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 東十条方面→大宮
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "東十条" &&
                    (fullPath[idx - 1].lineName === "トウホ２" || fullPath[idx - 1].lineName === "ツウカ" || fullPath[idx - 1].lineName === "ホセイ") &&
                    idx + 11 < fullPath.length &&
                    fullPath[idx + 11].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 東十条方面→土呂方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "東十条" &&
                    (fullPath[idx - 1].lineName === "トウホ２" || fullPath[idx - 1].lineName === "ツウカ" || fullPath[idx - 1].lineName === "ホセイ") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "トウホ" &&
                    fullPath[idx + 12].stationName === "土呂"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 東十条方面→宮原方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "東十条" &&
                    (fullPath[idx - 1].lineName === "トウホ２" || fullPath[idx - 1].lineName === "ツウカ" || fullPath[idx - 1].lineName === "ホセイ") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "タカサ" &&
                    fullPath[idx + 12].stationName === "宮原"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 東十条方面→日進方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "東十条" &&
                    (fullPath[idx - 1].lineName === "トウホ２" || fullPath[idx - 1].lineName === "ツウカ" || fullPath[idx - 1].lineName === "ホセイ") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "カワコ" &&
                    fullPath[idx + 12].stationName === "（川）日進"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 十条方面→大宮
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "十条" &&
                    (fullPath[idx - 1].lineName === "アカハ" || fullPath[idx - 1].lineName === "アカハネ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 11 < fullPath.length &&
                    fullPath[idx + 11].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 十条方面→土呂方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "十条" &&
                    (fullPath[idx - 1].lineName === "アカハ" || fullPath[idx - 1].lineName === "アカハネ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "トウホ" &&
                    fullPath[idx + 12].stationName === "土呂"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 十条方面→宮原方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "十条" &&
                    (fullPath[idx - 1].lineName === "アカハ" || fullPath[idx - 1].lineName === "アカハネ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "タカサ" &&
                    fullPath[idx + 12].stationName === "宮原"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 十条方面→日進方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "十条" &&
                    (fullPath[idx - 1].lineName === "アカハ" || fullPath[idx - 1].lineName === "アカハネ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 12 < fullPath.length &&
                    fullPath[idx + 11].lineName === "カワコ" &&
                    fullPath[idx + 12].stationName === "（川）日進"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "赤羽", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }
            }
        }

        for (let i = 0; i < fullPath.length - 11; i++) {
            if (fullPath[i + 0].stationName === "大宮" &&
                fullPath[i + 1].stationName === "北与野" &&
                fullPath[i + 2].stationName === "与野本町" &&
                fullPath[i + 3].stationName === "南与野" &&
                fullPath[i + 4].stationName === "中浦和" &&
                fullPath[i + 5].stationName === "武蔵浦和" &&
                fullPath[i + 6].stationName === "北戸田" &&
                fullPath[i + 7].stationName === "（東）戸田" &&
                fullPath[i + 8].stationName === "戸田公園" &&
                fullPath[i + 9].stationName === "浮間舟渡" &&
                fullPath[i + 10].stationName === "北赤羽" &&
                fullPath[i + 11].stationName === "赤羽" &&
                (fullPath[i + 0].lineName === "トウホ４" || fullPath[i + 0].lineName === "トウホオ") &&
                (fullPath[i + 1].lineName === "トウホ４" || fullPath[i + 1].lineName === "トウホア" || fullPath[i + 1].lineName === "トウホオ") &&
                (fullPath[i + 2].lineName === "トウホ４" || fullPath[i + 2].lineName === "トウホア" || fullPath[i + 2].lineName === "トウホオ") &&
                (fullPath[i + 3].lineName === "トウホ４" || fullPath[i + 3].lineName === "トウホア" || fullPath[i + 3].lineName === "トウホオ") &&
                (fullPath[i + 4].lineName === "トウホ４" || fullPath[i + 4].lineName === "トウホア" || fullPath[i + 4].lineName === "トウホオ") &&
                (fullPath[i + 5].lineName === "トウホ４" || fullPath[i + 5].lineName === "トウホア" || fullPath[i + 5].lineName === "トウホオ") &&
                (fullPath[i + 6].lineName === "トウホ４" || fullPath[i + 6].lineName === "トウホア" || fullPath[i + 6].lineName === "トウホオ") &&
                (fullPath[i + 7].lineName === "トウホ４" || fullPath[i + 7].lineName === "トウホア" || fullPath[i + 7].lineName === "トウホオ") &&
                (fullPath[i + 8].lineName === "トウホ４" || fullPath[i + 8].lineName === "トウホア" || fullPath[i + 8].lineName === "トウホオ") &&
                (fullPath[i + 9].lineName === "トウホ４" || fullPath[i + 9].lineName === "トウホア" || fullPath[i + 9].lineName === "トウホオ") &&
                (fullPath[i + 10].lineName === "トウホ４" || fullPath[i + 10].lineName === "トウホア")
            ) {
                const idx = i;

                // 大宮→赤羽
                if (idx === 0 &&
                    11 < fullPath.length &&
                    fullPath[11].lineName === null
                ) {
                    fullPath = [
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(11)
                    ]
                    break;
                }

                // 大宮→尾久方面
                if (idx === 0 &&
                    12 < fullPath.length &&
                    (fullPath[11].lineName === "トウホ" || fullPath[11].lineName === "オク") &&
                    fullPath[12].stationName === "尾久"
                ) {
                    fullPath = [
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(11)
                    ]
                    break;
                }

                // 大宮→東十条方面
                if (idx === 0 &&
                    12 < fullPath.length &&
                    (fullPath[11].lineName === "トウホ２" || fullPath[11].lineName === "ツウカ" || fullPath[11].lineName === "ホセイ") &&
                    fullPath[12].stationName === "東十条"
                ) {
                    fullPath = [
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(11)
                    ]
                    break;
                }

                // 大宮→十条方面
                if (idx === 0 &&
                    12 < fullPath.length &&
                    (fullPath[11].lineName === "アカハ" || fullPath[11].lineName === "アカハネ") &&
                    fullPath[12].stationName === "十条"
                ) {
                    fullPath = [
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(11)
                    ]
                    break;
                }

                // 土呂方面→赤羽
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "土呂" &&
                    fullPath[idx - 1].lineName === "トウホ" &&
                    idx + 11 < fullPath.length &&
                    fullPath[idx + 11].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 土呂方面→尾久方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "土呂" &&
                    fullPath[idx - 1].lineName === "トウホ" &&
                    idx + 11 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "トウホ" || fullPath[idx + 11].lineName === "オク") &&
                    fullPath[idx + 12].stationName === "尾久"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 土呂方面→東十条方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "土呂" &&
                    fullPath[idx - 1].lineName === "トウホ" &&
                    idx + 12 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "トウホ２" || fullPath[idx + 11].lineName === "ツウカ" || fullPath[idx + 11].lineName === "ホセイ") &&
                    fullPath[idx + 12].stationName === "東十条"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 土呂方面→十条方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "土呂" &&
                    fullPath[idx - 1].lineName === "トウホ" &&
                    idx + 11 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "アカハ" || fullPath[idx + 11].lineName === "アカハネ") &&
                    fullPath[idx + 12].stationName === "十条"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 宮原方面→赤羽
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "宮原" &&
                    fullPath[idx - 1].lineName === "タカサ" &&
                    idx + 11 < fullPath.length &&
                    fullPath[idx + 11].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 宮原方面→尾久方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "宮原" &&
                    fullPath[idx - 1].lineName === "タカサ" &&
                    idx + 11 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "トウホ" || fullPath[idx + 11].lineName === "オク") &&
                    fullPath[idx + 12].stationName === "尾久"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 宮原方面→東十条方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "宮原" &&
                    fullPath[idx - 1].lineName === "タカサ" &&
                    idx + 12 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "トウホ２" || fullPath[idx + 11].lineName === "ツウカ" || fullPath[idx + 11].lineName === "ホセイ") &&
                    fullPath[idx + 12].stationName === "東十条"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 宮原方面→十条方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "宮原" &&
                    fullPath[idx - 1].lineName === "タカサ" &&
                    idx + 12 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "アカハ" || fullPath[idx + 11].lineName === "アカハネ") &&
                    fullPath[idx + 12].stationName === "十条"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 日進方面→赤羽
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "（川）日進" &&
                    fullPath[idx - 1].lineName === "カワコ" &&
                    idx + 11 < fullPath.length &&
                    fullPath[idx + 11].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 日進方面→尾久方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "（川）日進" &&
                    fullPath[idx - 1].lineName === "カワコ" &&
                    idx + 12 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "トウホ" || fullPath[idx + 11].lineName === "オク") &&
                    fullPath[idx + 12].stationName === "尾久"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 日進方面→東十条方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "（川）日進" &&
                    fullPath[idx - 1].lineName === "カワコ" &&
                    idx + 12 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "トウホ２" || fullPath[idx + 11].lineName === "ツウカ" || fullPath[idx + 11].lineName === "ホセイ") &&
                    fullPath[idx + 12].stationName === "東十条"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }

                // 日進方面→十条方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "（川）日進" &&
                    fullPath[idx - 1].lineName === "カワコ" &&
                    idx + 12 < fullPath.length &&
                    (fullPath[idx + 11].lineName === "アカハ" || fullPath[idx + 11].lineName === "アカハネ") &&
                    fullPath[idx + 12].stationName === "十条"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大宮", lineName: "ホセイ" },
                        { stationName: "さいたま新都心", lineName: "ホセイ" },
                        { stationName: "与野", lineName: "ホセイ" },
                        { stationName: "北浦和", lineName: "ホセイ" },
                        { stationName: "浦和", lineName: "ホセイ" },
                        { stationName: "南浦和", lineName: "ホセイ" },
                        { stationName: "蕨", lineName: "ホセイ" },
                        { stationName: "西川口", lineName: "ホセイ" },
                        { stationName: "川口", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 11)
                    ]
                    break;
                }
            }
        }
    }

    // （4）品川以遠（高輪ゲートウェイ又は大崎方面）の各駅と、鶴見以遠（新子安、国道又は羽沢横浜国大方面）の各駅との相互間
    if (stationsOnFullPath.has("新川崎") === true &&
        stationsOnFullPath.has("大井町") === false &&
        stationsOnFullPath.has("大森") === false &&
        stationsOnFullPath.has("蒲田") === false &&
        stationsOnFullPath.has("川崎") === false
    ) {
        for (let i = 0; i < fullPath.length - 4; i++) {
            if (fullPath[i + 0].stationName === "品川" &&
                fullPath[i + 1].stationName === "西大井" &&
                fullPath[i + 2].stationName === "武蔵小杉" &&
                fullPath[i + 3].stationName === "新川崎" &&
                fullPath[i + 4].stationName === "鶴見" &&
                (fullPath[i + 0].lineName === "ヒンカ" || fullPath[i + 0].lineName === "ヒンカシ") &&
                (fullPath[i + 1].lineName === "ヒンカ" || fullPath[i + 1].lineName === "ヒンカシ" || fullPath[i + 1].lineName === "ヒンカツ") &&
                (fullPath[i + 2].lineName === "ヒンカ" || fullPath[i + 2].lineName === "ヒンカシ" || fullPath[i + 2].lineName === "ヒンカツ") &&
                (fullPath[i + 3].lineName === "ヒンカ" || fullPath[i + 3].lineName === "ヒンカツ")
            ) {
                const idx = i;

                // 品川→鶴見
                if (idx === 0 &&
                    4 < fullPath.length &&
                    fullPath[4].lineName === null
                ) {
                    fullPath = [
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(4)
                    ]
                    break;
                }

                // 品川→新子安方面
                if (idx === 0 &&
                    5 < fullPath.length &&
                    fullPath[4].lineName === "トウカ" &&
                    fullPath[5].stationName === "新子安"
                ) {
                    fullPath = [
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(4)
                    ]
                    break;
                }

                // 品川→国道方面
                if (idx === 0 &&
                    5 < fullPath.length &&
                    fullPath[4].lineName === "ツルミ" &&
                    fullPath[5].stationName === "国道"
                ) {
                    fullPath = [
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(4)
                    ]
                    break;
                }

                // 品川→羽沢横浜国大方面
                if (idx === 0 &&
                    5 < fullPath.length &&
                    fullPath[4].lineName === "トウカ３" &&
                    fullPath[5].stationName === "羽沢横浜国大"
                ) {
                    fullPath = [
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(4)
                    ]
                    break;
                }

                // 高輪ゲートウェイ方面→鶴見
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "高輪ゲートウェイ" &&
                    (fullPath[idx - 1].lineName === "トウカ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 4 < fullPath.length &&
                    fullPath[idx + 4].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 高輪ゲートウェイ方面→新子安方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "高輪ゲートウェイ" &&
                    (fullPath[idx - 1].lineName === "トウカ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 5 < fullPath.length &&
                    fullPath[idx + 4].lineName === "トウカ" &&
                    fullPath[idx + 5].stationName === "新子安"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 高輪ゲートウェイ方面→国道方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "高輪ゲートウェイ" &&
                    (fullPath[idx - 1].lineName === "トウカ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 5 < fullPath.length &&
                    fullPath[idx + 4].lineName === "ツルミ" &&
                    fullPath[idx + 5].stationName === "国道"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 高輪ゲートウェイ方面→羽沢横浜国大方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "高輪ゲートウェイ" &&
                    (fullPath[idx - 1].lineName === "トウカ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 5 < fullPath.length &&
                    fullPath[idx + 4].lineName === "トウカ３" &&
                    fullPath[idx + 5].stationName === "羽沢横浜国大"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 大崎方面→鶴見
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "大崎" &&
                    (fullPath[idx - 1].lineName === "ヤマテ１" || fullPath[idx - 1].lineName === "ヤマノテ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 4 < fullPath.length &&
                    fullPath[idx + 4].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 大崎方面→新子安方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "大崎" &&
                    (fullPath[idx - 1].lineName === "ヤマテ１" || fullPath[idx - 1].lineName === "ヤマノテ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 5 < fullPath.length &&
                    fullPath[idx + 4].lineName === "トウカ" &&
                    fullPath[idx + 5].stationName === "新子安"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 大崎方面→国道方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "大崎" &&
                    (fullPath[idx - 1].lineName === "ヤマテ１" || fullPath[idx - 1].lineName === "ヤマノテ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 5 < fullPath.length &&
                    fullPath[idx + 4].lineName === "ツルミ" &&
                    fullPath[idx + 5].stationName === "国道"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 大崎方面→羽沢横浜国大方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "大崎" &&
                    (fullPath[idx - 1].lineName === "ヤマテ１" || fullPath[idx - 1].lineName === "ヤマノテ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 5 < fullPath.length &&
                    fullPath[idx + 4].lineName === "トウカ３" &&
                    fullPath[idx + 5].stationName === "羽沢横浜国大"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "品川", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }
            }
        }

        for (let i = 0; i < fullPath.length - 4; i++) {
            if (fullPath[i + 0].stationName === "鶴見" &&
                fullPath[i + 1].stationName === "新川崎" &&
                fullPath[i + 2].stationName === "武蔵小杉" &&
                fullPath[i + 3].stationName === "西大井" &&
                fullPath[i + 4].stationName === "品川" &&
                (fullPath[i + 0].lineName === "ヒンカ" || fullPath[i + 0].lineName === "ヒンカツ") &&
                (fullPath[i + 1].lineName === "ヒンカ" || fullPath[i + 1].lineName === "ヒンカツ" || fullPath[i + 1].lineName === "ヒンカシ") &&
                (fullPath[i + 2].lineName === "ヒンカ" || fullPath[i + 2].lineName === "ヒンカツ" || fullPath[i + 2].lineName === "ヒンカシ") &&
                (fullPath[i + 3].lineName === "ヒンカ" || fullPath[i + 3].lineName === "ヒンカシ")
            ) {
                const idx = i;

                // 鶴見→品川
                if (idx === 0 &&
                    4 < fullPath.length &&
                    fullPath[4].lineName === null
                ) {
                    fullPath = [
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(4)
                    ]
                    break;
                }

                // 鶴見→高輪ゲートウェイ方面
                if (idx === 0 &&
                    5 < fullPath.length &&
                    (fullPath[4].lineName === "トウカ" || fullPath[4].lineName === "ツウカ") &&
                    fullPath[5].stationName === "高輪ゲートウェイ"
                ) {
                    fullPath = [
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(4)
                    ]
                    break;
                }

                // 鶴見→大崎方面
                if (idx === 0 &&
                    5 < fullPath.length &&
                    (fullPath[4].lineName === "ヤマテ１" || fullPath[4].lineName === "ヤマノテ" || fullPath[4].lineName === "ツウカ") &&
                    fullPath[5].stationName === "大崎"
                ) {
                    fullPath = [
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(4)
                    ]
                    break;
                }

                // 新子安方面→品川
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "新子安" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 4 < fullPath.length &&
                    fullPath[idx + 4].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 新子安方面→高輪ゲートウェイ方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "新子安" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 5 < fullPath.length &&
                    (fullPath[idx + 4].lineName === "トウカ" || fullPath[idx + 4].lineName === "ツウカ") &&
                    fullPath[idx + 5].stationName === "高輪ゲートウェイ"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 新子安方面→大崎方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "新子安" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 5 < fullPath.length &&
                    (fullPath[idx + 4].lineName === "ヤマテ１" || fullPath[idx + 4].lineName === "ヤマノテ" || fullPath[idx + 4].lineName === "ツウカ") &&
                    fullPath[idx + 5].stationName === "大崎"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 国道方面→品川
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "国道" &&
                    fullPath[idx - 1].lineName === "ツルミ" &&
                    idx + 4 < fullPath.length &&
                    fullPath[idx + 4].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 国道方面→高輪ゲートウェイ方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "国道" &&
                    fullPath[idx - 1].lineName === "ツルミ" &&
                    idx + 5 < fullPath.length &&
                    (fullPath[idx + 4].lineName === "トウカ" || fullPath[idx + 4].lineName === "ツウカ") &&
                    fullPath[idx + 5].stationName === "高輪ゲートウェイ"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 国道方面→大崎方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "国道" &&
                    fullPath[idx - 1].lineName === "ツルミ" &&
                    idx + 5 < fullPath.length &&
                    (fullPath[idx + 4].lineName === "ヤマテ１" || fullPath[idx + 4].lineName === "ヤマノテ" || fullPath[idx + 4].lineName === "ツウカ") &&
                    fullPath[idx + 5].stationName === "大崎"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 羽沢横浜国大方面→品川
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "羽沢横浜国大" &&
                    fullPath[idx - 1].lineName === "トウカ３" &&
                    idx + 4 < fullPath.length &&
                    fullPath[idx + 4].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 羽沢横浜国大方面→高輪ゲートウェイ方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "羽沢横浜国大" &&
                    fullPath[idx - 1].lineName === "トウカ３" &&
                    idx + 5 < fullPath.length &&
                    (fullPath[idx + 4].lineName === "トウカ" || fullPath[idx + 4].lineName === "ツウカ") &&
                    fullPath[idx + 5].stationName === "高輪ゲートウェイ"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }

                // 羽沢横浜国大方面→大崎方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "羽沢横浜国大" &&
                    fullPath[idx - 1].lineName === "トウカ３" &&
                    idx + 5 < fullPath.length &&
                    (fullPath[idx + 4].lineName === "ヤマテ１" || fullPath[idx + 4].lineName === "ヤマノテ" || fullPath[idx + 4].lineName === "ツウカ") &&
                    fullPath[idx + 5].stationName === "大崎"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "鶴見", lineName: "ホセイ" },
                        { stationName: "川崎", lineName: "ホセイ" },
                        { stationName: "蒲田", lineName: "ホセイ" },
                        { stationName: "大森", lineName: "ホセイ" },
                        { stationName: "大井町", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 4)
                    ]
                    break;
                }
            }
        }
    }

    // （5）東京以遠（有楽町又は神田方面）の各駅と、蘇我以遠（鎌取又は浜野方面）の各駅との相互間
    if (stationsOnFullPath.has("二俣新町") === true &&
        stationsOnFullPath.has("新日本橋") === false &&
        stationsOnFullPath.has("馬喰町") === false &&
        stationsOnFullPath.has("錦糸町") === false &&
        stationsOnFullPath.has("亀戸") === false &&
        stationsOnFullPath.has("平井") === false &&
        stationsOnFullPath.has("新小岩") === false &&
        stationsOnFullPath.has("小岩") === false &&
        stationsOnFullPath.has("市川") === false &&
        stationsOnFullPath.has("本八幡") === false &&
        stationsOnFullPath.has("下総中山") === false &&
        stationsOnFullPath.has("西船橋") === false &&
        stationsOnFullPath.has("船橋") === false &&
        stationsOnFullPath.has("東船橋") === false &&
        stationsOnFullPath.has("津田沼") === false &&
        stationsOnFullPath.has("幕張本郷") === false &&
        stationsOnFullPath.has("幕張") === false &&
        stationsOnFullPath.has("新検見川") === false &&
        stationsOnFullPath.has("稲毛") === false &&
        stationsOnFullPath.has("西千葉") === false &&
        stationsOnFullPath.has("千葉") === false &&
        stationsOnFullPath.has("本千葉") === false
    ) {
        for (let i = 0; i < fullPath.length - 4; i++) {
            if (fullPath[i + 0].stationName === "東京" &&
                fullPath[i + 1].stationName === "八丁堀" &&
                fullPath[i + 2].stationName === "越中島" &&
                fullPath[i + 3].stationName === "潮見" &&
                fullPath[i + 4].stationName === "新木場" &&
                fullPath[i + 5].stationName === "葛西臨海公園" &&
                fullPath[i + 6].stationName === "舞浜" &&
                fullPath[i + 7].stationName === "新浦安" &&
                fullPath[i + 8].stationName === "市川塩浜" &&
                fullPath[i + 9].stationName === "二俣新町" &&
                fullPath[i + 10].stationName === "南船橋" &&
                fullPath[i + 11].stationName === "新習志野" &&
                fullPath[i + 12].stationName === "幕張豊砂" &&
                fullPath[i + 13].stationName === "海浜幕張" &&
                fullPath[i + 14].stationName === "検見川浜" &&
                fullPath[i + 15].stationName === "稲毛海岸" &&
                fullPath[i + 16].stationName === "千葉みなと" &&
                fullPath[i + 17].stationName === "蘇我" &&
                fullPath[i + 0].lineName === "ケイヨ" &&
                fullPath[i + 1].lineName === "ケイヨ" &&
                fullPath[i + 2].lineName === "ケイヨ" &&
                fullPath[i + 3].lineName === "ケイヨ" &&
                fullPath[i + 4].lineName === "ケイヨ" &&
                fullPath[i + 5].lineName === "ケイヨ" &&
                fullPath[i + 6].lineName === "ケイヨ" &&
                fullPath[i + 7].lineName === "ケイヨ" &&
                fullPath[i + 8].lineName === "ケイヨ" &&
                fullPath[i + 9].lineName === "ケイヨ" &&
                fullPath[i + 10].lineName === "ケイヨ" &&
                fullPath[i + 11].lineName === "ケイヨ" &&
                fullPath[i + 12].lineName === "ケイヨ" &&
                fullPath[i + 13].lineName === "ケイヨ" &&
                fullPath[i + 14].lineName === "ケイヨ" &&
                fullPath[i + 15].lineName === "ケイヨ" &&
                fullPath[i + 16].lineName === "ケイヨ"
            ) {
                const idx = i;

                // 東京→蘇我
                if (idx === 0 &&
                    17 < fullPath.length &&
                    fullPath[17].lineName === null
                ) {
                    fullPath = [
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(17)
                    ]
                    break;
                }

                // 東京→鎌取方面
                if (idx === 0 &&
                    18 < fullPath.length &&
                    fullPath[17].lineName === "ソトホ" &&
                    fullPath[18].stationName === "鎌取"
                ) {
                    fullPath = [
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(17)
                    ]
                    break;
                }

                // 東京→浜野方面
                if (idx === 0 &&
                    18 < fullPath.length &&
                    (fullPath[17].lineName === "ウチホ" || fullPath[17].lineName === "ウチホソ") &&
                    fullPath[18].stationName === "浜野"
                ) {
                    fullPath = [
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(17)
                    ]
                    break;
                }

                // 有楽町方面→蘇我
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "有楽町" &&
                    (fullPath[idx - 1].lineName === "トウカ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 17 < fullPath.length &&
                    fullPath[idx + 17].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 有楽町方面→鎌取方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "有楽町" &&
                    (fullPath[idx - 1].lineName === "トウカ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 18 < fullPath.length &&
                    fullPath[idx + 17].lineName === "ソトホ" &&
                    fullPath[idx + 18].stationName === "鎌取"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 有楽町方面→浜野方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "有楽町" &&
                    (fullPath[idx - 1].lineName === "トウカ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 18 < fullPath.length &&
                    (fullPath[idx + 17].lineName === "ウチホ" || fullPath[idx + 17].lineName === "ウチホソ") &&
                    fullPath[idx + 18].stationName === "浜野"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 神田方面→蘇我
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "神田" &&
                    (fullPath[idx - 1].lineName === "チユト" || fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 17 < fullPath.length &&
                    fullPath[idx + 17].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 神田方面→鎌取方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "神田" &&
                    (fullPath[idx - 1].lineName === "チユト" || fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 18 < fullPath.length &&
                    fullPath[idx + 17].lineName === "ソトホ" &&
                    fullPath[idx + 18].stationName === "鎌取"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 神田方面→浜野方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "神田" &&
                    (fullPath[idx - 1].lineName === "チユト" || fullPath[idx - 1].lineName === "トウホ" || fullPath[idx - 1].lineName === "ツウカ") &&
                    idx + 18 < fullPath.length &&
                    (fullPath[idx + 17].lineName === "ウチホ" || fullPath[idx + 17].lineName === "ウチホソ") &&
                    fullPath[idx + 18].stationName === "浜野"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "東京", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "千葉", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }
            }
        }

        for (let i = 0; i < fullPath.length - 4; i++) {
            if (fullPath[i + 0].stationName === "蘇我" &&
                fullPath[i + 1].stationName === "千葉みなと" &&
                fullPath[i + 2].stationName === "稲毛海岸" &&
                fullPath[i + 3].stationName === "検見川浜" &&
                fullPath[i + 4].stationName === "海浜幕張" &&
                fullPath[i + 5].stationName === "幕張豊砂" &&
                fullPath[i + 6].stationName === "新習志野" &&
                fullPath[i + 7].stationName === "南船橋" &&
                fullPath[i + 8].stationName === "二俣新町" &&
                fullPath[i + 9].stationName === "市川塩浜" &&
                fullPath[i + 10].stationName === "新浦安" &&
                fullPath[i + 11].stationName === "舞浜" &&
                fullPath[i + 12].stationName === "葛西臨海公園" &&
                fullPath[i + 13].stationName === "新木場" &&
                fullPath[i + 14].stationName === "潮見" &&
                fullPath[i + 15].stationName === "越中島" &&
                fullPath[i + 16].stationName === "八丁堀" &&
                fullPath[i + 17].stationName === "東京" &&
                fullPath[i + 0].lineName === "ケイヨ" &&
                fullPath[i + 1].lineName === "ケイヨ" &&
                fullPath[i + 2].lineName === "ケイヨ" &&
                fullPath[i + 3].lineName === "ケイヨ" &&
                fullPath[i + 4].lineName === "ケイヨ" &&
                fullPath[i + 5].lineName === "ケイヨ" &&
                fullPath[i + 6].lineName === "ケイヨ" &&
                fullPath[i + 7].lineName === "ケイヨ" &&
                fullPath[i + 8].lineName === "ケイヨ" &&
                fullPath[i + 9].lineName === "ケイヨ" &&
                fullPath[i + 10].lineName === "ケイヨ" &&
                fullPath[i + 11].lineName === "ケイヨ" &&
                fullPath[i + 12].lineName === "ケイヨ" &&
                fullPath[i + 13].lineName === "ケイヨ" &&
                fullPath[i + 14].lineName === "ケイヨ" &&
                fullPath[i + 15].lineName === "ケイヨ" &&
                fullPath[i + 16].lineName === "ケイヨ"
            ) {
                const idx = i;

                // 蘇我→東京
                if (idx === 0 &&
                    17 < fullPath.length &&
                    fullPath[17].lineName === null
                ) {
                    fullPath = [
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(17)
                    ]
                    break;
                }

                // 蘇我→有楽町方面
                if (idx === 0 &&
                    18 < fullPath.length &&
                    (fullPath[17].lineName === "トウカ" || fullPath[17].lineName === "ツウカ") &&
                    fullPath[18].stationName === "有楽町"
                ) {
                    fullPath = [
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(17)
                    ]
                    break;
                }

                // 蘇我→神田方面
                if (idx === 0 &&
                    18 < fullPath.length &&
                    (fullPath[17].lineName === "チユト" || fullPath[17].lineName === "トウホ" || fullPath[17].lineName === "ツウカ") &&
                    fullPath[18].stationName === "神田"
                ) {
                    fullPath = [
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(17)
                    ]
                    break;
                }

                // 鎌取方面→東京
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "鎌取" &&
                    fullPath[idx - 1].lineName === "ソトホ" &&
                    idx + 17 < fullPath.length &&
                    fullPath[idx + 17].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 鎌取方面→有楽町方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "鎌取" &&
                    fullPath[idx - 1].lineName === "ソトホ" &&
                    idx + 18 < fullPath.length &&
                    (fullPath[idx + 17].lineName === "トウカ" || fullPath[idx + 17].lineName === "ツウカ") &&
                    fullPath[idx + 18].stationName === "有楽町"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 鎌取方面→神田方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "鎌取" &&
                    fullPath[idx - 1].lineName === "ソトホ" &&
                    idx + 18 < fullPath.length &&
                    (fullPath[idx + 17].lineName === "チユト" || fullPath[idx + 17].lineName === "トウホ" || fullPath[idx + 17].lineName === "ツウカ") &&
                    fullPath[idx + 18].stationName === "神田"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 浜野方面→東京
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "浜野" &&
                    (fullPath[idx - 1].lineName === "ウチホ" || fullPath[idx - 1].lineName === "ウチホソ") &&
                    idx + 17 < fullPath.length &&
                    fullPath[idx + 17].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 浜野方面→有楽町方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "浜野" &&
                    (fullPath[idx - 1].lineName === "ウチホ" || fullPath[idx - 1].lineName === "ウチホソ") &&
                    idx + 18 < fullPath.length &&
                    (fullPath[idx + 17].lineName === "トウカ" || fullPath[idx + 17].lineName === "ツウカ") &&
                    fullPath[idx + 18].stationName === "有楽町"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }

                // 浜野方面→神田方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "浜野" &&
                    (fullPath[idx - 1].lineName === "ウチホ" || fullPath[idx - 1].lineName === "ウチホソ") &&
                    idx + 18 < fullPath.length &&
                    (fullPath[idx + 17].lineName === "チユト" || fullPath[idx + 17].lineName === "トウホ" || fullPath[idx + 17].lineName === "ツウカ") &&
                    fullPath[idx + 18].stationName === "神田"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "蘇我", lineName: "ソトホ" },
                        { stationName: "本千葉", lineName: "ソトホ" },
                        { stationName: "千葉", lineName: "ソウフ" },
                        { stationName: "西千葉", lineName: "ソウフ" },
                        { stationName: "稲毛", lineName: "ソウフ" },
                        { stationName: "新検見川", lineName: "ソウフ" },
                        { stationName: "幕張", lineName: "ソウフ" },
                        { stationName: "幕張本郷", lineName: "ソウフ" },
                        { stationName: "津田沼", lineName: "ソウフ" },
                        { stationName: "東船橋", lineName: "ソウフ" },
                        { stationName: "船橋", lineName: "ソウフ" },
                        { stationName: "西船橋", lineName: "ソウフ" },
                        { stationName: "下総中山", lineName: "ソウフ" },
                        { stationName: "本八幡", lineName: "ソウフ" },
                        { stationName: "市川", lineName: "ソウフ" },
                        { stationName: "小岩", lineName: "ソウフ" },
                        { stationName: "新小岩", lineName: "ソウフ" },
                        { stationName: "平井", lineName: "ソウフ" },
                        { stationName: "亀戸", lineName: "ソウフ" },
                        { stationName: "錦糸町", lineName: "ソウフ" },
                        { stationName: "馬喰町", lineName: "ソウフ" },
                        { stationName: "新日本橋", lineName: "ソウフ" },
                        ...fullPath.slice(idx + 17)
                    ]
                    break;
                }
            }
        }
    }

    // （6）山科以遠（京都方面）の各駅と、近江塩津以遠（新疋田方面）の各駅との相互間
    if (stationsOnFullPath.has("米原") === true &&
        stationsOnFullPath.has("大津京") === false &&
        stationsOnFullPath.has("唐崎") === false &&
        stationsOnFullPath.has("比叡山坂本") === false &&
        stationsOnFullPath.has("おごと温泉") === false &&
        stationsOnFullPath.has("堅田") === false &&
        stationsOnFullPath.has("（湖）小野") === false &&
        stationsOnFullPath.has("和邇") === false &&
        stationsOnFullPath.has("蓬莱") === false &&
        stationsOnFullPath.has("志賀") === false &&
        stationsOnFullPath.has("比良") === false &&
        stationsOnFullPath.has("近江舞子") === false &&
        stationsOnFullPath.has("北小松") === false &&
        stationsOnFullPath.has("近江高島") === false &&
        stationsOnFullPath.has("安曇川") === false &&
        stationsOnFullPath.has("新旭") === false &&
        stationsOnFullPath.has("近江今津") === false &&
        stationsOnFullPath.has("近江中庄") === false &&
        stationsOnFullPath.has("マキノ") === false &&
        stationsOnFullPath.has("永原") === false
    ) {
        for (let i = 0; i < fullPath.length - 27; i++) {
            if (fullPath[i + 0].stationName === "山科" &&
                fullPath[i + 1].stationName === "大津" &&
                fullPath[i + 2].stationName === "膳所" &&
                fullPath[i + 3].stationName === "石山" &&
                fullPath[i + 4].stationName === "（東）瀬田" &&
                fullPath[i + 5].stationName === "南草津" &&
                fullPath[i + 6].stationName === "草津" &&
                fullPath[i + 7].stationName === "栗東" &&
                fullPath[i + 8].stationName === "守山" &&
                fullPath[i + 9].stationName === "野洲" &&
                fullPath[i + 10].stationName === "篠原" &&
                fullPath[i + 11].stationName === "近江八幡" &&
                fullPath[i + 12].stationName === "安土" &&
                fullPath[i + 13].stationName === "能登川" &&
                fullPath[i + 14].stationName === "稲枝" &&
                fullPath[i + 15].stationName === "河瀬" &&
                fullPath[i + 16].stationName === "南彦根" &&
                fullPath[i + 17].stationName === "彦根" &&
                fullPath[i + 18].stationName === "米原" &&
                fullPath[i + 19].stationName === "坂田" &&
                fullPath[i + 20].stationName === "田村" &&
                fullPath[i + 21].stationName === "長浜" &&
                fullPath[i + 22].stationName === "虎姫" &&
                fullPath[i + 23].stationName === "河毛" &&
                fullPath[i + 24].stationName === "高月" &&
                fullPath[i + 25].stationName === "木ノ本" &&
                fullPath[i + 26].stationName === "余呉" &&
                fullPath[i + 27].stationName === "近江塩津" &&
                fullPath[i + 0].lineName === "トウカ" &&
                fullPath[i + 1].lineName === "トウカ" &&
                fullPath[i + 2].lineName === "トウカ" &&
                fullPath[i + 3].lineName === "トウカ" &&
                fullPath[i + 4].lineName === "トウカ" &&
                fullPath[i + 5].lineName === "トウカ" &&
                fullPath[i + 6].lineName === "トウカ" &&
                fullPath[i + 7].lineName === "トウカ" &&
                fullPath[i + 8].lineName === "トウカ" &&
                fullPath[i + 9].lineName === "トウカ" &&
                fullPath[i + 10].lineName === "トウカ" &&
                fullPath[i + 11].lineName === "トウカ" &&
                fullPath[i + 12].lineName === "トウカ" &&
                fullPath[i + 13].lineName === "トウカ" &&
                fullPath[i + 14].lineName === "トウカ" &&
                fullPath[i + 15].lineName === "トウカ" &&
                fullPath[i + 16].lineName === "トウカ" &&
                fullPath[i + 17].lineName === "トウカ" &&
                fullPath[i + 18].lineName === "ホクリ" &&
                fullPath[i + 18].lineName === "ホクリ" &&
                fullPath[i + 19].lineName === "ホクリ" &&
                fullPath[i + 20].lineName === "ホクリ" &&
                fullPath[i + 22].lineName === "ホクリ" &&
                fullPath[i + 23].lineName === "ホクリ" &&
                fullPath[i + 24].lineName === "ホクリ" &&
                fullPath[i + 25].lineName === "ホクリ" &&
                fullPath[i + 26].lineName === "ホクリ"
            ) {
                const idx = i;

                // 山科→近江塩津
                if (idx === 0 &&
                    27 < fullPath.length &&
                    fullPath[27].lineName === null
                ) {
                    fullPath = [
                        { stationName: "山科", lineName: "ホセイ" },
                        { stationName: "大津京", lineName: "ホセイ" },
                        { stationName: "唐崎", lineName: "ホセイ" },
                        { stationName: "比叡山坂本", lineName: "ホセイ" },
                        { stationName: "おごと温泉", lineName: "ホセイ" },
                        { stationName: "堅田", lineName: "ホセイ" },
                        { stationName: "（湖）小野", lineName: "ホセイ" },
                        { stationName: "和邇", lineName: "ホセイ" },
                        { stationName: "蓬莱", lineName: "ホセイ" },
                        { stationName: "志賀", lineName: "ホセイ" },
                        { stationName: "比良", lineName: "ホセイ" },
                        { stationName: "近江舞子", lineName: "ホセイ" },
                        { stationName: "北小松", lineName: "ホセイ" },
                        { stationName: "近江高島", lineName: "ホセイ" },
                        { stationName: "安曇川", lineName: "ホセイ" },
                        { stationName: "新旭", lineName: "ホセイ" },
                        { stationName: "近江今津", lineName: "ホセイ" },
                        { stationName: "近江中庄", lineName: "ホセイ" },
                        { stationName: "マキノ", lineName: "ホセイ" },
                        { stationName: "永原", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 山科→新疋田方面
                if (idx === 0 &&
                    28 < fullPath.length &&
                    fullPath[27].lineName === "ホクリ" &&
                    fullPath[28].stationName === "新疋田"
                ) {
                    fullPath = [
                        { stationName: "山科", lineName: "ホセイ" },
                        { stationName: "大津京", lineName: "ホセイ" },
                        { stationName: "唐崎", lineName: "ホセイ" },
                        { stationName: "比叡山坂本", lineName: "ホセイ" },
                        { stationName: "おごと温泉", lineName: "ホセイ" },
                        { stationName: "堅田", lineName: "ホセイ" },
                        { stationName: "（湖）小野", lineName: "ホセイ" },
                        { stationName: "和邇", lineName: "ホセイ" },
                        { stationName: "蓬莱", lineName: "ホセイ" },
                        { stationName: "志賀", lineName: "ホセイ" },
                        { stationName: "比良", lineName: "ホセイ" },
                        { stationName: "近江舞子", lineName: "ホセイ" },
                        { stationName: "北小松", lineName: "ホセイ" },
                        { stationName: "近江高島", lineName: "ホセイ" },
                        { stationName: "安曇川", lineName: "ホセイ" },
                        { stationName: "新旭", lineName: "ホセイ" },
                        { stationName: "近江今津", lineName: "ホセイ" },
                        { stationName: "近江中庄", lineName: "ホセイ" },
                        { stationName: "マキノ", lineName: "ホセイ" },
                        { stationName: "永原", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 京都方面→近江塩津
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "京都" &&
                    fullPath[idx - 1].stationName === "トウカ" &&
                    idx + 27 < fullPath.length &&
                    fullPath[idx + 27].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "山科", lineName: "ホセイ" },
                        { stationName: "大津京", lineName: "ホセイ" },
                        { stationName: "唐崎", lineName: "ホセイ" },
                        { stationName: "比叡山坂本", lineName: "ホセイ" },
                        { stationName: "おごと温泉", lineName: "ホセイ" },
                        { stationName: "堅田", lineName: "ホセイ" },
                        { stationName: "（湖）小野", lineName: "ホセイ" },
                        { stationName: "和邇", lineName: "ホセイ" },
                        { stationName: "蓬莱", lineName: "ホセイ" },
                        { stationName: "志賀", lineName: "ホセイ" },
                        { stationName: "比良", lineName: "ホセイ" },
                        { stationName: "近江舞子", lineName: "ホセイ" },
                        { stationName: "北小松", lineName: "ホセイ" },
                        { stationName: "近江高島", lineName: "ホセイ" },
                        { stationName: "安曇川", lineName: "ホセイ" },
                        { stationName: "新旭", lineName: "ホセイ" },
                        { stationName: "近江今津", lineName: "ホセイ" },
                        { stationName: "近江中庄", lineName: "ホセイ" },
                        { stationName: "マキノ", lineName: "ホセイ" },
                        { stationName: "永原", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 27)
                    ]
                    break;
                }

                // 京都方面→新疋田方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "京都" &&
                    fullPath[idx - 1].stationName === "トウカ" &&
                    idx + 28 < fullPath.length &&
                    fullPath[idx + 27].lineName === "ホクリ" &&
                    fullPath[idx + 28].stationName === "新疋田"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "山科", lineName: "ホセイ" },
                        { stationName: "大津京", lineName: "ホセイ" },
                        { stationName: "唐崎", lineName: "ホセイ" },
                        { stationName: "比叡山坂本", lineName: "ホセイ" },
                        { stationName: "おごと温泉", lineName: "ホセイ" },
                        { stationName: "堅田", lineName: "ホセイ" },
                        { stationName: "（湖）小野", lineName: "ホセイ" },
                        { stationName: "和邇", lineName: "ホセイ" },
                        { stationName: "蓬莱", lineName: "ホセイ" },
                        { stationName: "志賀", lineName: "ホセイ" },
                        { stationName: "比良", lineName: "ホセイ" },
                        { stationName: "近江舞子", lineName: "ホセイ" },
                        { stationName: "北小松", lineName: "ホセイ" },
                        { stationName: "近江高島", lineName: "ホセイ" },
                        { stationName: "安曇川", lineName: "ホセイ" },
                        { stationName: "新旭", lineName: "ホセイ" },
                        { stationName: "近江今津", lineName: "ホセイ" },
                        { stationName: "近江中庄", lineName: "ホセイ" },
                        { stationName: "マキノ", lineName: "ホセイ" },
                        { stationName: "永原", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 27)
                    ]
                    break;
                }
            }
        }

        for (let i = 0; i < fullPath.length - 27; i++) {
            if (fullPath[i + 0].stationName === "近江塩津" &&
                fullPath[i + 1].stationName === "余呉" &&
                fullPath[i + 2].stationName === "木ノ本" &&
                fullPath[i + 3].stationName === "高月" &&
                fullPath[i + 4].stationName === "河毛" &&
                fullPath[i + 5].stationName === "虎姫" &&
                fullPath[i + 6].stationName === "長浜" &&
                fullPath[i + 7].stationName === "田村" &&
                fullPath[i + 8].stationName === "坂田" &&
                fullPath[i + 9].stationName === "米原" &&
                fullPath[i + 10].stationName === "彦根" &&
                fullPath[i + 11].stationName === "南彦根" &&
                fullPath[i + 12].stationName === "河瀬" &&
                fullPath[i + 13].stationName === "稲枝" &&
                fullPath[i + 14].stationName === "能登川" &&
                fullPath[i + 15].stationName === "安土" &&
                fullPath[i + 16].stationName === "近江八幡" &&
                fullPath[i + 17].stationName === "篠原" &&
                fullPath[i + 18].stationName === "野洲" &&
                fullPath[i + 19].stationName === "守山" &&
                fullPath[i + 20].stationName === "栗東" &&
                fullPath[i + 21].stationName === "草津" &&
                fullPath[i + 22].stationName === "南草津" &&
                fullPath[i + 23].stationName === "（東）瀬田" &&
                fullPath[i + 24].stationName === "石山" &&
                fullPath[i + 25].stationName === "膳所" &&
                fullPath[i + 26].stationName === "大津" &&
                fullPath[i + 27].stationName === "山科" &&
                fullPath[i + 0].lineName === "ホクリ" &&
                fullPath[i + 1].lineName === "ホクリ" &&
                fullPath[i + 2].lineName === "ホクリ" &&
                fullPath[i + 3].lineName === "ホクリ" &&
                fullPath[i + 4].lineName === "ホクリ" &&
                fullPath[i + 5].lineName === "ホクリ" &&
                fullPath[i + 6].lineName === "ホクリ" &&
                fullPath[i + 7].lineName === "ホクリ" &&
                fullPath[i + 8].lineName === "ホクリ" &&
                fullPath[i + 9].lineName === "トウカ" &&
                fullPath[i + 10].lineName === "トウカ" &&
                fullPath[i + 11].lineName === "トウカ" &&
                fullPath[i + 12].lineName === "トウカ" &&
                fullPath[i + 13].lineName === "トウカ" &&
                fullPath[i + 14].lineName === "トウカ" &&
                fullPath[i + 15].lineName === "トウカ" &&
                fullPath[i + 16].lineName === "トウカ" &&
                fullPath[i + 17].lineName === "トウカ" &&
                fullPath[i + 18].lineName === "トウカ" &&
                fullPath[i + 18].lineName === "トウカ" &&
                fullPath[i + 19].lineName === "トウカ" &&
                fullPath[i + 20].lineName === "トウカ" &&
                fullPath[i + 22].lineName === "トウカ" &&
                fullPath[i + 23].lineName === "トウカ" &&
                fullPath[i + 24].lineName === "トウカ" &&
                fullPath[i + 25].lineName === "トウカ" &&
                fullPath[i + 26].lineName === "トウカ"
            ) {
                const idx = i;

                // 近江塩津→山科
                if (idx === 0 &&
                    27 < fullPath.length &&
                    fullPath[27].lineName === null
                ) {
                    fullPath = [
                        { stationName: "近江塩津", lineName: "ホセイ" },
                        { stationName: "永原", lineName: "ホセイ" },
                        { stationName: "マキノ", lineName: "ホセイ" },
                        { stationName: "近江中庄", lineName: "ホセイ" },
                        { stationName: "近江今津", lineName: "ホセイ" },
                        { stationName: "新旭", lineName: "ホセイ" },
                        { stationName: "安曇川", lineName: "ホセイ" },
                        { stationName: "近江高島", lineName: "ホセイ" },
                        { stationName: "北小松", lineName: "ホセイ" },
                        { stationName: "近江舞子", lineName: "ホセイ" },
                        { stationName: "比良", lineName: "ホセイ" },
                        { stationName: "志賀", lineName: "ホセイ" },
                        { stationName: "蓬莱", lineName: "ホセイ" },
                        { stationName: "和邇", lineName: "ホセイ" },
                        { stationName: "（湖）小野", lineName: "ホセイ" },
                        { stationName: "堅田", lineName: "ホセイ" },
                        { stationName: "おごと温泉", lineName: "ホセイ" },
                        { stationName: "比叡山坂本", lineName: "ホセイ" },
                        { stationName: "唐崎", lineName: "ホセイ" },
                        { stationName: "大津京", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 近江塩津→京都方面
                if (idx === 0 &&
                    28 < fullPath.length &&
                    fullPath[27].lineName === "トウカ" &&
                    fullPath[27].stationName === "京都"
                ) {
                    fullPath = [
                        { stationName: "近江塩津", lineName: "ホセイ" },
                        { stationName: "永原", lineName: "ホセイ" },
                        { stationName: "マキノ", lineName: "ホセイ" },
                        { stationName: "近江中庄", lineName: "ホセイ" },
                        { stationName: "近江今津", lineName: "ホセイ" },
                        { stationName: "新旭", lineName: "ホセイ" },
                        { stationName: "安曇川", lineName: "ホセイ" },
                        { stationName: "近江高島", lineName: "ホセイ" },
                        { stationName: "北小松", lineName: "ホセイ" },
                        { stationName: "近江舞子", lineName: "ホセイ" },
                        { stationName: "比良", lineName: "ホセイ" },
                        { stationName: "志賀", lineName: "ホセイ" },
                        { stationName: "蓬莱", lineName: "ホセイ" },
                        { stationName: "和邇", lineName: "ホセイ" },
                        { stationName: "（湖）小野", lineName: "ホセイ" },
                        { stationName: "堅田", lineName: "ホセイ" },
                        { stationName: "おごと温泉", lineName: "ホセイ" },
                        { stationName: "比叡山坂本", lineName: "ホセイ" },
                        { stationName: "唐崎", lineName: "ホセイ" },
                        { stationName: "大津京", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 新疋田方面→山科
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "新疋田" &&
                    fullPath[idx - 1].lineName === "ホクリ" &&
                    idx + 27 < fullPath.length &&
                    fullPath[idx + 27].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "近江塩津", lineName: "ホセイ" },
                        { stationName: "永原", lineName: "ホセイ" },
                        { stationName: "マキノ", lineName: "ホセイ" },
                        { stationName: "近江中庄", lineName: "ホセイ" },
                        { stationName: "近江今津", lineName: "ホセイ" },
                        { stationName: "新旭", lineName: "ホセイ" },
                        { stationName: "安曇川", lineName: "ホセイ" },
                        { stationName: "近江高島", lineName: "ホセイ" },
                        { stationName: "北小松", lineName: "ホセイ" },
                        { stationName: "近江舞子", lineName: "ホセイ" },
                        { stationName: "比良", lineName: "ホセイ" },
                        { stationName: "志賀", lineName: "ホセイ" },
                        { stationName: "蓬莱", lineName: "ホセイ" },
                        { stationName: "和邇", lineName: "ホセイ" },
                        { stationName: "（湖）小野", lineName: "ホセイ" },
                        { stationName: "堅田", lineName: "ホセイ" },
                        { stationName: "おごと温泉", lineName: "ホセイ" },
                        { stationName: "比叡山坂本", lineName: "ホセイ" },
                        { stationName: "唐崎", lineName: "ホセイ" },
                        { stationName: "大津京", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 27)
                    ]
                    break;
                }

                // 新疋田方面→京都方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "新疋田" &&
                    fullPath[idx - 1].lineName === "ホクリ" &&
                    idx + 28 < fullPath.length &&
                    fullPath[idx + 27].lineName === "トウカ" &&
                    fullPath[idx + 28].stationName === "京都"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "近江塩津", lineName: "ホセイ" },
                        { stationName: "永原", lineName: "ホセイ" },
                        { stationName: "マキノ", lineName: "ホセイ" },
                        { stationName: "近江中庄", lineName: "ホセイ" },
                        { stationName: "近江今津", lineName: "ホセイ" },
                        { stationName: "新旭", lineName: "ホセイ" },
                        { stationName: "安曇川", lineName: "ホセイ" },
                        { stationName: "近江高島", lineName: "ホセイ" },
                        { stationName: "北小松", lineName: "ホセイ" },
                        { stationName: "近江舞子", lineName: "ホセイ" },
                        { stationName: "比良", lineName: "ホセイ" },
                        { stationName: "志賀", lineName: "ホセイ" },
                        { stationName: "蓬莱", lineName: "ホセイ" },
                        { stationName: "和邇", lineName: "ホセイ" },
                        { stationName: "（湖）小野", lineName: "ホセイ" },
                        { stationName: "堅田", lineName: "ホセイ" },
                        { stationName: "おごと温泉", lineName: "ホセイ" },
                        { stationName: "比叡山坂本", lineName: "ホセイ" },
                        { stationName: "唐崎", lineName: "ホセイ" },
                        { stationName: "大津京", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 27)
                    ]
                    break;
                }
            }
        }
    }

    // （7）大阪以遠（塚本又は新大阪方面）の各駅と、天王寺以遠（東部市場前又は美章園方面）の各駅との相互間
    if (stationsOnFullPath.has("（環）福島") === true &&
        stationsOnFullPath.has("天満") === false &&
        stationsOnFullPath.has("桜ノ宮") === false &&
        stationsOnFullPath.has("京橋") === false &&
        stationsOnFullPath.has("大阪城公園") === false &&
        stationsOnFullPath.has("森ノ宮") === false &&
        stationsOnFullPath.has("玉造") === false &&
        stationsOnFullPath.has("鶴橋") === false &&
        stationsOnFullPath.has("桃谷") === false &&
        stationsOnFullPath.has("寺田町") === false
    ) {
        for (let i = 0; i < fullPath.length - 9; i++) {
            if (fullPath[i + 0].stationName === "大阪" &&
                fullPath[i + 1].stationName === "（環）福島" &&
                fullPath[i + 2].stationName === "野田" &&
                fullPath[i + 3].stationName === "西九条" &&
                fullPath[i + 4].stationName === "弁天町" &&
                fullPath[i + 5].stationName === "大正" &&
                fullPath[i + 6].stationName === "芦原橋" &&
                fullPath[i + 7].stationName === "今宮" &&
                fullPath[i + 8].stationName === "新今宮" &&
                fullPath[i + 9].stationName === "天王寺" &&
                fullPath[i + 0].lineName === "オオサ２" &&
                fullPath[i + 1].lineName === "オオサ２" &&
                fullPath[i + 2].lineName === "オオサ２" &&
                fullPath[i + 3].lineName === "オオサ２" &&
                fullPath[i + 4].lineName === "オオサ２" &&
                fullPath[i + 5].lineName === "オオサ２" &&
                fullPath[i + 6].lineName === "オオサ２" &&
                fullPath[i + 7].lineName === "カンサ" &&
                fullPath[i + 8].lineName === "カンサ"
            ) {

                const idx = i;

                // 大阪→天王寺
                if (idx === 0 &&
                    9 < fullPath.length &&
                    fullPath[9].lineName === null
                ) {
                    fullPath = [
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(9)
                    ]
                    break;
                }

                // 大阪→東部市場前方面
                if (idx === 0 &&
                    10 < fullPath.length &&
                    fullPath[9].lineName === "カンサ" &&
                    fullPath[10].stationName === "東部市場前"
                ) {
                    fullPath = [
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(9)
                    ]
                    break;
                }

                // 大阪→美章園方面
                if (idx === 0 &&
                    10 < fullPath.length &&
                    fullPath[9].lineName === "ハンワ" &&
                    fullPath[10].stationName === "美章園"
                ) {
                    fullPath = [
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(9)
                    ]
                    break;
                }

                // 塚本方面→天王寺
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "塚本" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 9 < fullPath.length &&
                    fullPath[idx + 9].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 塚本方面→東部市場前方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "塚本" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 10 < fullPath.length &&
                    fullPath[idx + 9].lineName === "カンサ" &&
                    fullPath[idx + 10].stationName === "東部市場前"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 塚本方面→美章園方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "塚本" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 10 < fullPath.length &&
                    fullPath[idx + 9].lineName === "ハンワ" &&
                    fullPath[idx + 10].stationName === "美章園"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 新大阪方面→天王寺
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "新大阪" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 9 < fullPath.length &&
                    fullPath[idx + 9].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 新大阪方面→東部市場前方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "新大阪" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 10 < fullPath.length &&
                    fullPath[idx + 9].lineName === "カンサ" &&
                    fullPath[idx + 10].stationName === "東部市場前"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 新大阪方面→美章園方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "新大阪" &&
                    fullPath[idx - 1].lineName === "トウカ" &&
                    idx + 10 < fullPath.length &&
                    fullPath[idx + 9].lineName === "ハンワ" &&
                    fullPath[idx + 10].stationName === "美章園"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "大阪", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }
            }
        }

        for (let i = 0; i < fullPath.length - 9; i++) {
            if (fullPath[i + 0].stationName === "天王寺" &&
                fullPath[i + 1].stationName === "新今宮" &&
                fullPath[i + 2].stationName === "今宮" &&
                fullPath[i + 3].stationName === "芦原橋" &&
                fullPath[i + 4].stationName === "大正" &&
                fullPath[i + 5].stationName === "弁天町" &&
                fullPath[i + 6].stationName === "西九条" &&
                fullPath[i + 7].stationName === "野田" &&
                fullPath[i + 8].stationName === "（環）福島" &&
                fullPath[i + 9].stationName === "大阪" &&
                fullPath[i + 0].lineName === "カンサ" &&
                fullPath[i + 1].lineName === "カンサ" &&
                fullPath[i + 2].lineName === "オオサ２" &&
                fullPath[i + 3].lineName === "オオサ２" &&
                fullPath[i + 4].lineName === "オオサ２" &&
                fullPath[i + 5].lineName === "オオサ２" &&
                fullPath[i + 6].lineName === "オオサ２" &&
                fullPath[i + 7].lineName === "オオサ２" &&
                fullPath[i + 8].lineName === "オオサ２"
            ) {

                const idx = i;

                // 天王寺→大阪
                if (idx === 0 &&
                    9 < fullPath.length &&
                    fullPath[9].lineName === null
                ) {
                    fullPath = [
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(9)
                    ]
                    break;
                }

                // 天王寺→塚本方面
                if (idx === 0 &&
                    10 < fullPath.length &&
                    fullPath[9].lineName === "トウカ" &&
                    fullPath[10].stationName === "塚本"
                ) {
                    fullPath = [
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(9)
                    ]
                    break;
                }

                // 天王寺→新大阪方面
                if (idx === 0 &&
                    10 < fullPath.length &&
                    fullPath[9].lineName === "トウカ" &&
                    fullPath[10].stationName === "新大阪"
                ) {
                    fullPath = [
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(9)
                    ]
                    break;
                }

                // 東部市場前方面→大阪
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "東部市場前" &&
                    fullPath[idx - 1].lineName === "カンサ" &&
                    idx + 9 < fullPath.length &&
                    fullPath[idx + 9].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 東部市場前方面→塚本方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "東部市場前" &&
                    fullPath[idx - 1].lineName === "カンサ" &&
                    idx + 10 < fullPath.length &&
                    fullPath[idx + 9].lineName === "トウカ" &&
                    fullPath[idx + 10].stationName === "塚本"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 東部市場前方面→新大阪方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "東部市場前" &&
                    fullPath[idx - 1].lineName === "カンサ" &&
                    idx + 10 < fullPath.length &&
                    fullPath[idx + 9].lineName === "トウカ" &&
                    fullPath[idx + 10].stationName === "新大阪"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 美章園方面→大阪
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "美章園" &&
                    fullPath[idx - 1].lineName === "ハンワ" &&
                    idx + 9 < fullPath.length &&
                    fullPath[idx + 9].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 美章園方面→塚本方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "美章園" &&
                    fullPath[idx - 1].lineName === "ハンワ" &&
                    idx + 10 < fullPath.length &&
                    fullPath[idx + 9].lineName === "トウカ" &&
                    fullPath[idx + 10].stationName === "塚本"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }

                // 美章園方面→新大阪方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "美章園" &&
                    fullPath[idx - 1].lineName === "ハンワ" &&
                    idx + 10 < fullPath.length &&
                    fullPath[idx + 9].lineName === "トウカ" &&
                    fullPath[idx + 10].stationName === "新大阪"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "天王寺", lineName: "オオサ" },
                        { stationName: "寺田町", lineName: "オオサ" },
                        { stationName: "桃谷", lineName: "オオサ" },
                        { stationName: "鶴橋", lineName: "オオサ" },
                        { stationName: "玉造", lineName: "オオサ" },
                        { stationName: "森ノ宮", lineName: "オオサ" },
                        { stationName: "大阪城公園", lineName: "オオサ" },
                        { stationName: "京橋", lineName: "オオサ" },
                        { stationName: "桜ノ宮", lineName: "オオサ" },
                        { stationName: "天満", lineName: "オオサ" },
                        ...fullPath.slice(idx + 9)
                    ]
                    break;
                }
            }
        }
    }

    // （8）三原以遠（糸崎方面）の各駅と、海田市以遠（向洋方面）の各駅との相互間
    if (stationsOnFullPath.has("呉") === true &&
        stationsOnFullPath.has("本郷") === false &&
        stationsOnFullPath.has("河内") === false &&
        stationsOnFullPath.has("（陽）入野") === false &&
        stationsOnFullPath.has("白市") === false &&
        stationsOnFullPath.has("西高屋") === false &&
        stationsOnFullPath.has("（陽）西条") === false &&
        stationsOnFullPath.has("寺家") === false &&
        stationsOnFullPath.has("八本松") === false &&
        stationsOnFullPath.has("瀬野") === false &&
        stationsOnFullPath.has("中野東") === false &&
        stationsOnFullPath.has("安芸中野") === false
    ) {
        for (let i = 0; i < fullPath.length - 27; i++) {
            if (fullPath[i + 0].stationName === "三原" &&
                fullPath[i + 1].stationName === "須波" &&
                fullPath[i + 2].stationName === "安芸幸崎" &&
                fullPath[i + 3].stationName === "忠海" &&
                fullPath[i + 4].stationName === "安芸長浜" &&
                fullPath[i + 5].stationName === "大乗" &&
                fullPath[i + 6].stationName === "竹原" &&
                fullPath[i + 7].stationName === "吉名" &&
                fullPath[i + 8].stationName === "安芸津" &&
                fullPath[i + 9].stationName === "風早" &&
                fullPath[i + 10].stationName === "安浦" &&
                fullPath[i + 11].stationName === "安登" &&
                fullPath[i + 12].stationName === "安芸川尻" &&
                fullPath[i + 13].stationName === "仁方" &&
                fullPath[i + 14].stationName === "広" &&
                fullPath[i + 15].stationName === "新広" &&
                fullPath[i + 16].stationName === "安芸阿賀" &&
                fullPath[i + 17].stationName === "呉" &&
                fullPath[i + 18].stationName === "川原石" &&
                fullPath[i + 19].stationName === "吉浦" &&
                fullPath[i + 20].stationName === "かるが浜" &&
                fullPath[i + 21].stationName === "天応" &&
                fullPath[i + 22].stationName === "呉ポートピア" &&
                fullPath[i + 23].stationName === "小屋浦" &&
                fullPath[i + 24].stationName === "水尻" &&
                fullPath[i + 25].stationName === "坂" &&
                fullPath[i + 26].stationName === "矢野" &&
                fullPath[i + 27].stationName === "海田市" &&
                (fullPath[i + 0].lineName === "クレ" || fullPath[i + 0].lineName === "クレミ") &&
                (fullPath[i + 1].lineName === "クレ" || fullPath[i + 1].lineName === "クレミ" || fullPath[i + 1].lineName === "クレカ") &&
                (fullPath[i + 2].lineName === "クレ" || fullPath[i + 2].lineName === "クレミ" || fullPath[i + 2].lineName === "クレカ") &&
                (fullPath[i + 3].lineName === "クレ" || fullPath[i + 3].lineName === "クレミ" || fullPath[i + 3].lineName === "クレカ") &&
                (fullPath[i + 4].lineName === "クレ" || fullPath[i + 4].lineName === "クレミ" || fullPath[i + 4].lineName === "クレカ") &&
                (fullPath[i + 5].lineName === "クレ" || fullPath[i + 5].lineName === "クレミ" || fullPath[i + 5].lineName === "クレカ") &&
                (fullPath[i + 6].lineName === "クレ" || fullPath[i + 6].lineName === "クレミ" || fullPath[i + 6].lineName === "クレカ") &&
                (fullPath[i + 7].lineName === "クレ" || fullPath[i + 7].lineName === "クレミ" || fullPath[i + 7].lineName === "クレカ") &&
                (fullPath[i + 8].lineName === "クレ" || fullPath[i + 8].lineName === "クレミ" || fullPath[i + 8].lineName === "クレカ") &&
                (fullPath[i + 9].lineName === "クレ" || fullPath[i + 9].lineName === "クレミ" || fullPath[i + 9].lineName === "クレカ") &&
                (fullPath[i + 10].lineName === "クレ" || fullPath[i + 10].lineName === "クレミ" || fullPath[i + 10].lineName === "クレカ") &&
                (fullPath[i + 11].lineName === "クレ" || fullPath[i + 11].lineName === "クレミ" || fullPath[i + 11].lineName === "クレカ") &&
                (fullPath[i + 12].lineName === "クレ" || fullPath[i + 12].lineName === "クレミ" || fullPath[i + 12].lineName === "クレカ") &&
                (fullPath[i + 13].lineName === "クレ" || fullPath[i + 13].lineName === "クレミ" || fullPath[i + 13].lineName === "クレカ") &&
                (fullPath[i + 14].lineName === "クレ" || fullPath[i + 14].lineName === "クレミ" || fullPath[i + 14].lineName === "クレカ") &&
                (fullPath[i + 15].lineName === "クレ" || fullPath[i + 15].lineName === "クレミ" || fullPath[i + 15].lineName === "クレカ") &&
                (fullPath[i + 16].lineName === "クレ" || fullPath[i + 16].lineName === "クレミ" || fullPath[i + 16].lineName === "クレカ") &&
                (fullPath[i + 17].lineName === "クレ" || fullPath[i + 17].lineName === "クレミ" || fullPath[i + 17].lineName === "クレカ") &&
                (fullPath[i + 18].lineName === "クレ" || fullPath[i + 18].lineName === "クレミ" || fullPath[i + 18].lineName === "クレカ") &&
                (fullPath[i + 19].lineName === "クレ" || fullPath[i + 19].lineName === "クレミ" || fullPath[i + 19].lineName === "クレカ") &&
                (fullPath[i + 20].lineName === "クレ" || fullPath[i + 20].lineName === "クレミ" || fullPath[i + 20].lineName === "クレカ") &&
                (fullPath[i + 21].lineName === "クレ" || fullPath[i + 21].lineName === "クレミ" || fullPath[i + 21].lineName === "クレカ") &&
                (fullPath[i + 22].lineName === "クレ" || fullPath[i + 22].lineName === "クレミ" || fullPath[i + 22].lineName === "クレカ") &&
                (fullPath[i + 23].lineName === "クレ" || fullPath[i + 23].lineName === "クレミ" || fullPath[i + 23].lineName === "クレカ") &&
                (fullPath[i + 24].lineName === "クレ" || fullPath[i + 24].lineName === "クレミ" || fullPath[i + 24].lineName === "クレカ") &&
                (fullPath[i + 25].lineName === "クレ" || fullPath[i + 25].lineName === "クレミ" || fullPath[i + 25].lineName === "クレカ") &&
                (fullPath[i + 26].lineName === "クレ" || fullPath[i + 26].lineName === "クレカ")
            ) {
                const idx = i;

                // 三原→海田市
                if (idx === 0 &&
                    27 < fullPath.length &&
                    fullPath[27].lineName === null
                ) {
                    fullPath = [
                        { stationName: "三原", lineName: "ホセイ" },
                        { stationName: "本郷", lineName: "ホセイ" },
                        { stationName: "河内", lineName: "ホセイ" },
                        { stationName: "（陽）入野", lineName: "ホセイ" },
                        { stationName: "白市", lineName: "ホセイ" },
                        { stationName: "西高屋", lineName: "ホセイ" },
                        { stationName: "（陽）西条", lineName: "ホセイ" },
                        { stationName: "寺家", lineName: "ホセイ" },
                        { stationName: "八本松", lineName: "ホセイ" },
                        { stationName: "瀬野", lineName: "ホセイ" },
                        { stationName: "中野東", lineName: "ホセイ" },
                        { stationName: "安芸中野", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 三原→向洋方面
                if (idx === 0 &&
                    28 < fullPath.length &&
                    fullPath[27].lineName === "サンヨ" &&
                    fullPath[28].stationName === "向洋"
                ) {
                    fullPath = [
                        { stationName: "三原", lineName: "ホセイ" },
                        { stationName: "本郷", lineName: "ホセイ" },
                        { stationName: "河内", lineName: "ホセイ" },
                        { stationName: "（陽）入野", lineName: "ホセイ" },
                        { stationName: "白市", lineName: "ホセイ" },
                        { stationName: "西高屋", lineName: "ホセイ" },
                        { stationName: "（陽）西条", lineName: "ホセイ" },
                        { stationName: "寺家", lineName: "ホセイ" },
                        { stationName: "八本松", lineName: "ホセイ" },
                        { stationName: "瀬野", lineName: "ホセイ" },
                        { stationName: "中野東", lineName: "ホセイ" },
                        { stationName: "安芸中野", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 糸崎方面→海田市
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "糸崎" &&
                    fullPath[idx - 1].lineName === "サンヨ" &&
                    idx + 27 < fullPath.length &&
                    fullPath[idx + 27].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "三原", lineName: "ホセイ" },
                        { stationName: "本郷", lineName: "ホセイ" },
                        { stationName: "河内", lineName: "ホセイ" },
                        { stationName: "（陽）入野", lineName: "ホセイ" },
                        { stationName: "白市", lineName: "ホセイ" },
                        { stationName: "西高屋", lineName: "ホセイ" },
                        { stationName: "（陽）西条", lineName: "ホセイ" },
                        { stationName: "寺家", lineName: "ホセイ" },
                        { stationName: "八本松", lineName: "ホセイ" },
                        { stationName: "瀬野", lineName: "ホセイ" },
                        { stationName: "中野東", lineName: "ホセイ" },
                        { stationName: "安芸中野", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 27)
                    ]
                    break;
                }

                // 糸崎方面→向洋方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "糸崎" &&
                    fullPath[idx - 1].lineName === "サンヨ" &&
                    idx + 28 < fullPath.length &&
                    fullPath[idx + 27].lineName === "サンヨ" &&
                    fullPath[idx + 28].stationName === "向洋"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "三原", lineName: "ホセイ" },
                        { stationName: "本郷", lineName: "ホセイ" },
                        { stationName: "河内", lineName: "ホセイ" },
                        { stationName: "（陽）入野", lineName: "ホセイ" },
                        { stationName: "白市", lineName: "ホセイ" },
                        { stationName: "西高屋", lineName: "ホセイ" },
                        { stationName: "（陽）西条", lineName: "ホセイ" },
                        { stationName: "寺家", lineName: "ホセイ" },
                        { stationName: "八本松", lineName: "ホセイ" },
                        { stationName: "瀬野", lineName: "ホセイ" },
                        { stationName: "中野東", lineName: "ホセイ" },
                        { stationName: "安芸中野", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 27)
                    ]
                    break;
                }
            }
        }

        for (let i = 0; i < fullPath.length - 27; i++) {
            if (fullPath[i + 0].stationName === "海田市" &&
                fullPath[i + 1].stationName === "矢野" &&
                fullPath[i + 2].stationName === "坂" &&
                fullPath[i + 3].stationName === "水尻" &&
                fullPath[i + 4].stationName === "小屋浦" &&
                fullPath[i + 5].stationName === "呉ポートピア" &&
                fullPath[i + 6].stationName === "天応" &&
                fullPath[i + 7].stationName === "かるが浜" &&
                fullPath[i + 8].stationName === "吉浦" &&
                fullPath[i + 9].stationName === "川原石" &&
                fullPath[i + 10].stationName === "呉" &&
                fullPath[i + 11].stationName === "安芸阿賀" &&
                fullPath[i + 12].stationName === "新広" &&
                fullPath[i + 13].stationName === "広" &&
                fullPath[i + 14].stationName === "仁方" &&
                fullPath[i + 15].stationName === "安芸川尻" &&
                fullPath[i + 16].stationName === "安登" &&
                fullPath[i + 17].stationName === "安浦" &&
                fullPath[i + 18].stationName === "風早" &&
                fullPath[i + 19].stationName === "安芸津" &&
                fullPath[i + 20].stationName === "吉名" &&
                fullPath[i + 21].stationName === "竹原" &&
                fullPath[i + 22].stationName === "大乗" &&
                fullPath[i + 23].stationName === "安芸長浜" &&
                fullPath[i + 24].stationName === "忠海" &&
                fullPath[i + 25].stationName === "安芸幸崎" &&
                fullPath[i + 26].stationName === "須波" &&
                fullPath[i + 27].stationName === "三原" &&
                (fullPath[i + 0].lineName === "クレ" || fullPath[i + 0].lineName === "クレカ") &&
                (fullPath[i + 1].lineName === "クレ" || fullPath[i + 1].lineName === "クレカ" || fullPath[i + 1].lineName === "クレミ") &&
                (fullPath[i + 2].lineName === "クレ" || fullPath[i + 2].lineName === "クレカ" || fullPath[i + 2].lineName === "クレミ") &&
                (fullPath[i + 3].lineName === "クレ" || fullPath[i + 3].lineName === "クレカ" || fullPath[i + 3].lineName === "クレミ") &&
                (fullPath[i + 4].lineName === "クレ" || fullPath[i + 4].lineName === "クレカ" || fullPath[i + 4].lineName === "クレミ") &&
                (fullPath[i + 5].lineName === "クレ" || fullPath[i + 5].lineName === "クレカ" || fullPath[i + 5].lineName === "クレミ") &&
                (fullPath[i + 6].lineName === "クレ" || fullPath[i + 6].lineName === "クレカ" || fullPath[i + 6].lineName === "クレミ") &&
                (fullPath[i + 7].lineName === "クレ" || fullPath[i + 7].lineName === "クレカ" || fullPath[i + 7].lineName === "クレミ") &&
                (fullPath[i + 8].lineName === "クレ" || fullPath[i + 8].lineName === "クレカ" || fullPath[i + 8].lineName === "クレミ") &&
                (fullPath[i + 9].lineName === "クレ" || fullPath[i + 9].lineName === "クレカ" || fullPath[i + 9].lineName === "クレミ") &&
                (fullPath[i + 10].lineName === "クレ" || fullPath[i + 10].lineName === "クレカ" || fullPath[i + 10].lineName === "クレミ") &&
                (fullPath[i + 11].lineName === "クレ" || fullPath[i + 11].lineName === "クレカ" || fullPath[i + 11].lineName === "クレミ") &&
                (fullPath[i + 12].lineName === "クレ" || fullPath[i + 12].lineName === "クレカ" || fullPath[i + 12].lineName === "クレミ") &&
                (fullPath[i + 13].lineName === "クレ" || fullPath[i + 13].lineName === "クレカ" || fullPath[i + 13].lineName === "クレミ") &&
                (fullPath[i + 14].lineName === "クレ" || fullPath[i + 14].lineName === "クレカ" || fullPath[i + 14].lineName === "クレミ") &&
                (fullPath[i + 15].lineName === "クレ" || fullPath[i + 15].lineName === "クレカ" || fullPath[i + 15].lineName === "クレミ") &&
                (fullPath[i + 16].lineName === "クレ" || fullPath[i + 16].lineName === "クレカ" || fullPath[i + 16].lineName === "クレミ") &&
                (fullPath[i + 17].lineName === "クレ" || fullPath[i + 17].lineName === "クレカ" || fullPath[i + 17].lineName === "クレミ") &&
                (fullPath[i + 18].lineName === "クレ" || fullPath[i + 18].lineName === "クレカ" || fullPath[i + 18].lineName === "クレミ") &&
                (fullPath[i + 19].lineName === "クレ" || fullPath[i + 19].lineName === "クレカ" || fullPath[i + 19].lineName === "クレミ") &&
                (fullPath[i + 20].lineName === "クレ" || fullPath[i + 20].lineName === "クレカ" || fullPath[i + 20].lineName === "クレミ") &&
                (fullPath[i + 21].lineName === "クレ" || fullPath[i + 21].lineName === "クレカ" || fullPath[i + 21].lineName === "クレミ") &&
                (fullPath[i + 22].lineName === "クレ" || fullPath[i + 22].lineName === "クレカ" || fullPath[i + 22].lineName === "クレミ") &&
                (fullPath[i + 23].lineName === "クレ" || fullPath[i + 23].lineName === "クレカ" || fullPath[i + 23].lineName === "クレミ") &&
                (fullPath[i + 24].lineName === "クレ" || fullPath[i + 24].lineName === "クレカ" || fullPath[i + 24].lineName === "クレミ") &&
                (fullPath[i + 25].lineName === "クレ" || fullPath[i + 25].lineName === "クレカ" || fullPath[i + 25].lineName === "クレミ") &&
                (fullPath[i + 26].lineName === "クレ" || fullPath[i + 26].lineName === "クレミ")
            ) {
                const idx = i;

                // 海田市→三原
                if (idx === 0 &&
                    27 < fullPath.length &&
                    fullPath[27].lineName === null
                ) {
                    fullPath = [
                        { stationName: "海田市", lineName: "ホセイ" },
                        { stationName: "安芸中野", lineName: "ホセイ" },
                        { stationName: "中野東", lineName: "ホセイ" },
                        { stationName: "瀬野", lineName: "ホセイ" },
                        { stationName: "八本松", lineName: "ホセイ" },
                        { stationName: "寺家", lineName: "ホセイ" },
                        { stationName: "（陽）西条", lineName: "ホセイ" },
                        { stationName: "西高屋", lineName: "ホセイ" },
                        { stationName: "白市", lineName: "ホセイ" },
                        { stationName: "（陽）入野", lineName: "ホセイ" },
                        { stationName: "河内", lineName: "ホセイ" },
                        { stationName: "本郷", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 海田市→糸崎方面
                if (idx === 0 &&
                    28 < fullPath.length &&
                    fullPath[27].lineName === "サンヨ" &&
                    fullPath[28].stationName === "糸崎"
                ) {
                    fullPath = [
                        { stationName: "海田市", lineName: "ホセイ" },
                        { stationName: "安芸中野", lineName: "ホセイ" },
                        { stationName: "中野東", lineName: "ホセイ" },
                        { stationName: "瀬野", lineName: "ホセイ" },
                        { stationName: "八本松", lineName: "ホセイ" },
                        { stationName: "寺家", lineName: "ホセイ" },
                        { stationName: "（陽）西条", lineName: "ホセイ" },
                        { stationName: "西高屋", lineName: "ホセイ" },
                        { stationName: "白市", lineName: "ホセイ" },
                        { stationName: "（陽）入野", lineName: "ホセイ" },
                        { stationName: "河内", lineName: "ホセイ" },
                        { stationName: "本郷", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 向洋方面→三原
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "向洋" &&
                    fullPath[idx - 1].lineName === "サンヨ" &&
                    idx + 27 < fullPath.length &&
                    fullPath[idx + 27].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "海田市", lineName: "ホセイ" },
                        { stationName: "安芸中野", lineName: "ホセイ" },
                        { stationName: "中野東", lineName: "ホセイ" },
                        { stationName: "瀬野", lineName: "ホセイ" },
                        { stationName: "八本松", lineName: "ホセイ" },
                        { stationName: "寺家", lineName: "ホセイ" },
                        { stationName: "（陽）西条", lineName: "ホセイ" },
                        { stationName: "西高屋", lineName: "ホセイ" },
                        { stationName: "白市", lineName: "ホセイ" },
                        { stationName: "（陽）入野", lineName: "ホセイ" },
                        { stationName: "河内", lineName: "ホセイ" },
                        { stationName: "本郷", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }

                // 向洋方面→糸崎方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "向洋" &&
                    fullPath[idx - 1].lineName === "サンヨ" &&
                    idx + 28 < fullPath.length &&
                    fullPath[idx + 27].lineName === "サンヨ" &&
                    fullPath[idx + 28].stationName === "糸崎"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "海田市", lineName: "ホセイ" },
                        { stationName: "安芸中野", lineName: "ホセイ" },
                        { stationName: "中野東", lineName: "ホセイ" },
                        { stationName: "瀬野", lineName: "ホセイ" },
                        { stationName: "八本松", lineName: "ホセイ" },
                        { stationName: "寺家", lineName: "ホセイ" },
                        { stationName: "（陽）西条", lineName: "ホセイ" },
                        { stationName: "西高屋", lineName: "ホセイ" },
                        { stationName: "白市", lineName: "ホセイ" },
                        { stationName: "（陽）入野", lineName: "ホセイ" },
                        { stationName: "河内", lineName: "ホセイ" },
                        { stationName: "本郷", lineName: "ホセイ" },
                        ...fullPath.slice(27)
                    ]
                    break;
                }
            }
        }
    }

    // （9）岩国以遠（和木方面）の各駅と、櫛ヶ浜以遠（徳山方面）の各駅との相互間
    if (stationsOnFullPath.has("柳井") === true &&
        stationsOnFullPath.has("西岩国") === false &&
        stationsOnFullPath.has("川西") === false &&
        stationsOnFullPath.has("柱野") === false &&
        stationsOnFullPath.has("欽明路") === false &&
        stationsOnFullPath.has("玖珂") === false &&
        stationsOnFullPath.has("周防高森") === false &&
        stationsOnFullPath.has("米川") === false &&
        stationsOnFullPath.has("高水") === false &&
        stationsOnFullPath.has("勝間") === false &&
        stationsOnFullPath.has("大河内") === false &&
        stationsOnFullPath.has("周防久保") === false &&
        stationsOnFullPath.has("生野屋") === false &&
        stationsOnFullPath.has("周防花岡") === false
    ) {
        for (let i = 0; i < fullPath.length - 14; i++) {
            if (fullPath[i + 0].stationName === "岩国" &&
                fullPath[i + 1].stationName === "南岩国" &&
                fullPath[i + 2].stationName === "藤生" &&
                fullPath[i + 3].stationName === "通津" &&
                fullPath[i + 4].stationName === "由宇" &&
                fullPath[i + 5].stationName === "（陽）神代" &&
                fullPath[i + 6].stationName === "大畠" &&
                fullPath[i + 7].stationName === "柳井港" &&
                fullPath[i + 8].stationName === "柳井" &&
                fullPath[i + 9].stationName === "田布施" &&
                fullPath[i + 10].stationName === "岩田" &&
                fullPath[i + 11].stationName === "（陽）島田" &&
                fullPath[i + 12].stationName === "光" &&
                fullPath[i + 13].stationName === "（陽）下松" &&
                fullPath[i + 14].stationName === "櫛ケ浜" &&
                fullPath[i + 0].lineName === "サンヨ" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].lineName === "サンヨ" &&
                fullPath[i + 3].lineName === "サンヨ" &&
                fullPath[i + 4].lineName === "サンヨ" &&
                fullPath[i + 5].lineName === "サンヨ" &&
                fullPath[i + 6].lineName === "サンヨ" &&
                fullPath[i + 7].lineName === "サンヨ" &&
                fullPath[i + 8].lineName === "サンヨ" &&
                fullPath[i + 9].lineName === "サンヨ" &&
                fullPath[i + 10].lineName === "サンヨ" &&
                fullPath[i + 11].lineName === "サンヨ" &&
                fullPath[i + 12].lineName === "サンヨ" &&
                fullPath[i + 13].lineName === "サンヨ"
            ) {
                const idx = i;

                // 岩国→櫛ヶ浜
                if (idx === 0 &&
                    14 < fullPath.length &&
                    fullPath[14].lineName === null
                ) {
                    fullPath = [
                        { stationName: "岩国", lineName: "ホセイ" },
                        { stationName: "西岩国", lineName: "ホセイ" },
                        { stationName: "川西", lineName: "ホセイ" },
                        { stationName: "柱野", lineName: "ホセイ" },
                        { stationName: "欽明路", lineName: "ホセイ" },
                        { stationName: "玖珂", lineName: "ホセイ" },
                        { stationName: "周防高森", lineName: "ホセイ" },
                        { stationName: "米川", lineName: "ホセイ" },
                        { stationName: "高水", lineName: "ホセイ" },
                        { stationName: "勝間", lineName: "ホセイ" },
                        { stationName: "大河内", lineName: "ホセイ" },
                        { stationName: "周防久保", lineName: "ホセイ" },
                        { stationName: "生野屋", lineName: "ホセイ" },
                        { stationName: "周防花岡", lineName: "ホセイ" },
                        ...fullPath.slice(14)
                    ]
                    break;
                }

                // 岩国→徳山方面
                if (idx === 0 &&
                    15 < fullPath.length &&
                    fullPath[15].lineName === "サンヨ"
                ) {
                    fullPath = [
                        { stationName: "岩国", lineName: "ホセイ" },
                        { stationName: "西岩国", lineName: "ホセイ" },
                        { stationName: "川西", lineName: "ホセイ" },
                        { stationName: "柱野", lineName: "ホセイ" },
                        { stationName: "欽明路", lineName: "ホセイ" },
                        { stationName: "玖珂", lineName: "ホセイ" },
                        { stationName: "周防高森", lineName: "ホセイ" },
                        { stationName: "米川", lineName: "ホセイ" },
                        { stationName: "高水", lineName: "ホセイ" },
                        { stationName: "勝間", lineName: "ホセイ" },
                        { stationName: "大河内", lineName: "ホセイ" },
                        { stationName: "周防久保", lineName: "ホセイ" },
                        { stationName: "生野屋", lineName: "ホセイ" },
                        { stationName: "周防花岡", lineName: "ホセイ" },
                        ...fullPath.slice(14)
                    ]
                    break;
                }

                // 和木方面→櫛ヶ浜
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "和木" &&
                    fullPath[idx - 1].lineName === "サンヨ" &&
                    idx + 14 < fullPath.length &&
                    fullPath[idx + 14].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "岩国", lineName: "ホセイ" },
                        { stationName: "西岩国", lineName: "ホセイ" },
                        { stationName: "川西", lineName: "ホセイ" },
                        { stationName: "柱野", lineName: "ホセイ" },
                        { stationName: "欽明路", lineName: "ホセイ" },
                        { stationName: "玖珂", lineName: "ホセイ" },
                        { stationName: "周防高森", lineName: "ホセイ" },
                        { stationName: "米川", lineName: "ホセイ" },
                        { stationName: "高水", lineName: "ホセイ" },
                        { stationName: "勝間", lineName: "ホセイ" },
                        { stationName: "大河内", lineName: "ホセイ" },
                        { stationName: "周防久保", lineName: "ホセイ" },
                        { stationName: "生野屋", lineName: "ホセイ" },
                        { stationName: "周防花岡", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 14)
                    ]
                    break;
                }

                // 和木方面→徳山方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "和木" &&
                    fullPath[idx - 1].lineName === "サンヨ" &&
                    idx + 15 < fullPath.length &&
                    fullPath[idx + 14].lineName === "サンヨ" &&
                    fullPath[idx + 15].stationName === "徳山"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "岩国", lineName: "ホセイ" },
                        { stationName: "西岩国", lineName: "ホセイ" },
                        { stationName: "川西", lineName: "ホセイ" },
                        { stationName: "柱野", lineName: "ホセイ" },
                        { stationName: "欽明路", lineName: "ホセイ" },
                        { stationName: "玖珂", lineName: "ホセイ" },
                        { stationName: "周防高森", lineName: "ホセイ" },
                        { stationName: "米川", lineName: "ホセイ" },
                        { stationName: "高水", lineName: "ホセイ" },
                        { stationName: "勝間", lineName: "ホセイ" },
                        { stationName: "大河内", lineName: "ホセイ" },
                        { stationName: "周防久保", lineName: "ホセイ" },
                        { stationName: "生野屋", lineName: "ホセイ" },
                        { stationName: "周防花岡", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 14)
                    ]
                    break;
                }
            }
        }

        for (let i = 0; i < fullPath.length - 14; i++) {
            if (fullPath[i + 0].stationName === "櫛ケ浜" &&
                fullPath[i + 1].stationName === "（陽）下松" &&
                fullPath[i + 2].stationName === "光" &&
                fullPath[i + 3].stationName === "（陽）島田" &&
                fullPath[i + 4].stationName === "岩田" &&
                fullPath[i + 5].stationName === "田布施" &&
                fullPath[i + 6].stationName === "柳井" &&
                fullPath[i + 7].stationName === "柳井港" &&
                fullPath[i + 8].stationName === "大畠" &&
                fullPath[i + 9].stationName === "（陽）神代" &&
                fullPath[i + 10].stationName === "由宇" &&
                fullPath[i + 11].stationName === "通津" &&
                fullPath[i + 12].stationName === "藤生" &&
                fullPath[i + 13].stationName === "南岩国" &&
                fullPath[i + 14].stationName === "岩国" &&
                fullPath[i + 0].lineName === "サンヨ" &&
                fullPath[i + 1].lineName === "サンヨ" &&
                fullPath[i + 2].lineName === "サンヨ" &&
                fullPath[i + 3].lineName === "サンヨ" &&
                fullPath[i + 4].lineName === "サンヨ" &&
                fullPath[i + 5].lineName === "サンヨ" &&
                fullPath[i + 6].lineName === "サンヨ" &&
                fullPath[i + 7].lineName === "サンヨ" &&
                fullPath[i + 8].lineName === "サンヨ" &&
                fullPath[i + 9].lineName === "サンヨ" &&
                fullPath[i + 10].lineName === "サンヨ" &&
                fullPath[i + 11].lineName === "サンヨ" &&
                fullPath[i + 12].lineName === "サンヨ" &&
                fullPath[i + 13].lineName === "サンヨ"
            ) {
                const idx = i;

                // 櫛ヶ浜→岩国
                if (idx === 0 &&
                    14 < fullPath.length &&
                    fullPath[14].lineName === null
                ) {
                    fullPath = [
                        { stationName: "櫛ケ浜", lineName: "ホセイ" },
                        { stationName: "周防花岡", lineName: "ホセイ" },
                        { stationName: "生野屋", lineName: "ホセイ" },
                        { stationName: "周防久保", lineName: "ホセイ" },
                        { stationName: "大河内", lineName: "ホセイ" },
                        { stationName: "勝間", lineName: "ホセイ" },
                        { stationName: "高水", lineName: "ホセイ" },
                        { stationName: "米川", lineName: "ホセイ" },
                        { stationName: "周防高森", lineName: "ホセイ" },
                        { stationName: "玖珂", lineName: "ホセイ" },
                        { stationName: "欽明路", lineName: "ホセイ" },
                        { stationName: "柱野", lineName: "ホセイ" },
                        { stationName: "川西", lineName: "ホセイ" },
                        { stationName: "西岩国", lineName: "ホセイ" },
                        ...fullPath.slice(14)
                    ]
                    break;
                }

                // 櫛ヶ浜→和木方面
                if (idx === 0 &&
                    15 < fullPath.length &&
                    fullPath[14].lineName === "サンヨ" &&
                    fullPath[15].stationName === "和木"
                ) {
                    fullPath = [
                        { stationName: "櫛ケ浜", lineName: "ホセイ" },
                        { stationName: "周防花岡", lineName: "ホセイ" },
                        { stationName: "生野屋", lineName: "ホセイ" },
                        { stationName: "周防久保", lineName: "ホセイ" },
                        { stationName: "大河内", lineName: "ホセイ" },
                        { stationName: "勝間", lineName: "ホセイ" },
                        { stationName: "高水", lineName: "ホセイ" },
                        { stationName: "米川", lineName: "ホセイ" },
                        { stationName: "周防高森", lineName: "ホセイ" },
                        { stationName: "玖珂", lineName: "ホセイ" },
                        { stationName: "欽明路", lineName: "ホセイ" },
                        { stationName: "柱野", lineName: "ホセイ" },
                        { stationName: "川西", lineName: "ホセイ" },
                        { stationName: "西岩国", lineName: "ホセイ" },
                        ...fullPath.slice(14)
                    ]
                    break;
                }

                // 徳山方面→岩国
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "徳山" &&
                    fullPath[idx - 1].lineName === "サンヨ" &&
                    idx + 14 < fullPath.length &&
                    fullPath[idx + 14].lineName === null
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "櫛ケ浜", lineName: "ホセイ" },
                        { stationName: "周防花岡", lineName: "ホセイ" },
                        { stationName: "生野屋", lineName: "ホセイ" },
                        { stationName: "周防久保", lineName: "ホセイ" },
                        { stationName: "大河内", lineName: "ホセイ" },
                        { stationName: "勝間", lineName: "ホセイ" },
                        { stationName: "高水", lineName: "ホセイ" },
                        { stationName: "米川", lineName: "ホセイ" },
                        { stationName: "周防高森", lineName: "ホセイ" },
                        { stationName: "玖珂", lineName: "ホセイ" },
                        { stationName: "欽明路", lineName: "ホセイ" },
                        { stationName: "柱野", lineName: "ホセイ" },
                        { stationName: "川西", lineName: "ホセイ" },
                        { stationName: "西岩国", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 14)
                    ]
                    break;
                }

                // 徳山方面→和木方面
                if (0 < idx &&
                    fullPath[idx - 1].stationName === "徳山" &&
                    fullPath[idx - 1].lineName === "サンヨ" &&
                    idx + 15 < fullPath.length &&
                    fullPath[idx + 14].lineName === "サンヨ" &&
                    fullPath[idx + 15].stationName === "和木"
                ) {
                    fullPath = [
                        ...fullPath.slice(0, idx),
                        { stationName: "櫛ケ浜", lineName: "ホセイ" },
                        { stationName: "周防花岡", lineName: "ホセイ" },
                        { stationName: "生野屋", lineName: "ホセイ" },
                        { stationName: "周防久保", lineName: "ホセイ" },
                        { stationName: "大河内", lineName: "ホセイ" },
                        { stationName: "勝間", lineName: "ホセイ" },
                        { stationName: "高水", lineName: "ホセイ" },
                        { stationName: "米川", lineName: "ホセイ" },
                        { stationName: "周防高森", lineName: "ホセイ" },
                        { stationName: "玖珂", lineName: "ホセイ" },
                        { stationName: "欽明路", lineName: "ホセイ" },
                        { stationName: "柱野", lineName: "ホセイ" },
                        { stationName: "川西", lineName: "ホセイ" },
                        { stationName: "西岩国", lineName: "ホセイ" },
                        ...fullPath.slice(idx + 14)
                    ]
                    break;
                }
            }
        }
    }

    console.log(fullPath);

    // 特殊経由線も追加したか？
    return fullPath;
}

// 第70条 旅客が次に掲げる図の太線区間を通過する場合
// 第160条 特定区間発着の場合のう回乗車
function applyBoldLineAreaRule(fullPath: PathStep[]) {
    const boldLineArea = load.getTrainSpecificSections("電車大環状線");
    const changeIdx: number[] = [];

    for (let i = 0; i < fullPath.length - 2; i++) {
        const line0 = fullPath[i].lineName;
        const line1 = fullPath[i + 1].lineName;
        if (line0 === null || line1 === null) throw new Error(`applyBoldLineAreaRuleでエラーが発生しました.`);
        if (boldLineArea.has(createRouteKey(line0, fullPath[i].stationName, fullPath[i + 1].stationName)) !==
            boldLineArea.has(createRouteKey(line1, fullPath[i + 1].stationName, fullPath[i + 2].stationName)))
            changeIdx.push(i + 1);
    }

    // 着駅補正
    if (changeIdx.length > 0 &&
        boldLineArea.has(createRouteKey(fullPath[fullPath.length - 2].lineName!, fullPath[fullPath.length - 2].stationName, fullPath[fullPath.length - 1].stationName)) === true) {
        const idx = changeIdx.pop()!;
        const boldLineAreaRoute = load.getToBoldLineAreaRoute([fullPath[idx].stationName, fullPath[fullPath.length - 1].stationName].join("-"));
        if (boldLineAreaRoute !== null) {
            fullPath = [
                ...fullPath.slice(0, idx),
                ...boldLineAreaRoute
            ]
        }
    }

    // 通過補正
    while (changeIdx.length >= 2) {
        const exitIdx = changeIdx.pop()!;
        const entryIdx = changeIdx.pop()!;
        const passingRoute = load.getPassingBoldLineAreaRoute([fullPath[entryIdx].stationName, fullPath[exitIdx].stationName].join("-"))
        if (passingRoute !== null)
            fullPath = [
                ...fullPath.slice(0, entryIdx),
                ...passingRoute,
                ...fullPath.slice(exitIdx)
            ]
    }

    // 発駅補正
    if (changeIdx.length === 1 &&
        boldLineArea.has(createRouteKey(fullPath[0].lineName!, fullPath[0].stationName, fullPath[1].stationName)) === true
    ) {
        const idx = changeIdx.pop()!;
        const boldLineAreaRoute = load.getFromBoldLineAreaRoute([fullPath[0].stationName, fullPath[idx].stationName].join("-"));
        if (boldLineAreaRoute !== null) {
            fullPath = [
                ...boldLineAreaRoute,
                ...fullPath.slice(idx)
            ]
        }
    }

    if (changeIdx.length !== 0) {
        throw new Error("電車大環状線の補正中にエラーが起きました．");
    }

    return fullPath;
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
