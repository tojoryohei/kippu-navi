"use client";

import { useForm, Controller, SubmitHandler, useFieldArray, useWatch } from "react-hook-form";
import type { SingleValue } from "react-select";
import { useState, useRef, useEffect } from "react";
import { RiArrowUpDownLine } from "react-icons/ri";
import { usePostHog } from "posthog-js/react";

import stationData from "@/app/fare/data/stations.json";
import lineData from "@/app/fare/data/lines.json";
import { getLineByName, getKana } from '@/app/fare/lib/loadData';
import SelectStation from "@/app/fare/components/SelectStation";
import SelectLine from "@/app/fare/components/SelectLine";

import { useRouter, usePathname } from "next/navigation";
import { stringifyRoute, parseRoute } from "@/app/fare/lib/routeParser";

import { Station, Line, KippuData, IFormInput, PathStep, CalculationMode, SearchType } from "@/app/types";

const stationMap = new Map(stationData.map(s => [s.name, s]));
const SHINKANSEN_LINES: Set<string> = new Set(["山形新幹線", "北海道新幹線", "九州新幹線", "上越新幹線", "新幹線", "東北新幹線", "西九州新幹線", "北陸新幹線"]);
const TEMPORARY_STATIONS = [
    "原生花園",
    "ラベンダー畑",
    "細岡",
    "猪苗代湖畔",
    "ガーラ湯沢",
    "偕楽園",
    "鹿島サッカースタジアム",
    "津島ノ宮",
    "田井ノ浜",
    "バルーンさが"
];
const SKIP_SECTION_RULES: string[][] = [
    ["（北）福島", "笹木野", "庭坂", "板谷", "峠", "（奥）大沢", "関根", "米沢"],
    ["米沢", "置賜", "高畠", "赤湯"],
    ["赤湯", "中川", "羽前中山", "かみのやま温泉"],
    ["茂吉記念館前", "蔵王", "山形"],
    ["羽前千歳", "南出羽", "漆山", "高擶", "天童南", "天童"],
    ["天童", "乱川", "神町", "さくらんぼ東根"],
    ["さくらんぼ東根", "東根", "村山"],
    ["村山", "袖崎", "大石田"],
    ["大石田", "北大石田", "芦沢", "舟形", "新庄"],
    ["久留米", "荒木", "西牟田", "羽犬塚", "筑後船小屋"],
    ["熊本", "西熊本", "川尻", "富合", "宇土"],
    ["宇土", "松橋", "小川", "有佐", "千丁", "新八代"],
    ["（鹿）川内", "隈之城", "木場茶屋", "串木野", "神村学園前", "市来", "湯之元", "東市来", "伊集院", "薩摩松元", "上伊集院", "広木", "鹿児島中央"],
    ["神田", "秋葉原", "御徒町", "上野", "王子"],
    ["上野", "鶯谷", "日暮里"],
    ["日暮里", "西日暮里", "田端", "上中里", "東十条", "赤羽"],
    ["赤羽", "川口", "西川口", "蕨", "南浦和", "浦和", "北浦和", "与野", "さいたま新都心", "大宮"],
    ["大宮", "宮原", "上尾", "北上尾", "桶川", "北本", "鴻巣", "北鴻巣", "吹上", "行田", "熊谷"],
    ["越後湯沢", "石打", "（上）大沢", "上越国際スキー場前", "塩沢", "六日町", "五日町", "浦佐"],
    ["浦佐", "八色", "小出", "越後堀之内", "北堀之内", "越後川口", "小千谷", "越後滝谷", "宮内", "長岡"],
    ["熱海", "函南", "三島"],
    ["静岡", "安倍川", "用宗", "焼津", "西焼津", "藤枝", "六合", "（東）島田", "金谷", "菊川", "掛川"],
    ["掛川", "愛野", "袋井", "御厨", "磐田", "豊田町", "天竜川", "浜松"],
    ["浜松", "高塚", "舞阪", "弁天島", "新居町", "鷲津", "新所原", "二川", "豊橋"],
    ["豊橋", "西小坂井", "愛知御津", "三河大塚", "三河三谷", "蒲郡", "三河塩津", "三ケ根", "幸田", "相見", "岡崎", "西岡崎", "安城", "三河安城"],
    ["三河安城", "東刈谷", "野田新町", "刈谷", "逢妻", "大府", "共和", "南大高", "大高", "笠寺", "熱田", "（中）金山"],
    ["（中）金山", "尾頭橋", "名古屋"],
    ["米原", "彦根", "南彦根", "河瀬", "稲枝", "能登川", "安土", "近江八幡", "篠原", "野洲", "守山", "栗東", "草津", "南草津", "（東）瀬田", "石山", "膳所", "大津", "山科"],
    ["京都", "西大路", "（東）桂川", "向日町", "長岡京", "（東）山崎", "島本", "高槻", "摂津富田", "ＪＲ総持寺", "茨木", "千里丘", "岸辺", "吹田", "東淀川", "新大阪"],
    ["西明石", "（陽）大久保", "魚住", "土山", "東加古川", "加古川", "宝殿", "曽根", "ひめじ別所", "御着", "東姫路", "姫路"],
    ["姫路", "手柄山平和公園", "英賀保", "はりま勝原", "網干", "竜野", "相生"],
    ["相生", "有年", "上郡", "三石", "吉永", "和気", "熊山", "万富", "瀬戸", "（陽）上道", "東岡山"],
    ["東岡山", "高島", "西川原", "岡山"],
    ["岡山", "北長瀬", "庭瀬", "中庄", "倉敷"],
    ["倉敷", "西阿知", "新倉敷"],
    ["新倉敷", "金光", "鴨方", "里庄", "笠岡", "大門", "東福山", "福山"],
    ["徳山", "新南陽", "福川", "（陽）戸田", "富海", "防府", "大道", "四辻", "新山口"],
    ["新山口", "嘉川", "本由良", "厚東", "宇部", "小野田", "厚狭"],
    ["厚狭", "埴生", "小月", "長府", "新下関"],
    ["新下関", "幡生", "下関", "門司", "小倉"],
    ["大宮", "土呂", "東大宮", "蓮田", "白岡", "新白岡", "久喜", "東鷲宮", "栗橋", "古河", "野木", "間々田", "小山"],
    ["小山", "小金井", "自治医大", "石橋", "雀宮", "宇都宮"],
    ["宇都宮", "岡本", "宝積寺"],
    ["宝積寺", "氏家", "蒲須坂", "片岡", "矢板", "（北）野崎", "西那須野", "那須塩原"],
    ["那須塩原", "黒磯", "高久", "黒田原", "豊原", "白坂", "新白河"],
    ["新白河", "白河", "久田野", "泉崎", "矢吹", "鏡石", "須賀川", "安積永盛"],
    ["（北）郡山", "日和田", "五百川", "本宮", "杉田", "二本松", "安達", "松川", "金谷川", "南福島", "（北）福島"],
    ["一ノ関", "山ノ目", "平泉", "前沢", "陸中折居", "水沢", "金ケ崎", "六原", "北上"],
    ["諫早", "西諫早", "喜々津", "市布", "肥前古賀", "現川", "浦上"]
];
interface FormValues extends IFormInput {
    calculationMode: CalculationMode;
    searchType: SearchType;
}

interface FormProps {
    initialRoute?: string;
    initialFrom?: string;
    initialTo?: string;
    initialSearchType?: SearchType;
    initialCalculationMode?: CalculationMode;
}

export default function Form({
    initialRoute,
    initialFrom,
    initialTo,
    initialSearchType = "ticket",
    initialCalculationMode = "normal",
}: FormProps) {
    const router = useRouter();
    const pathname = usePathname();
    const posthog = usePostHog();
    const lastTrackedSearch = useRef<string | null>(null);

    const { register, handleSubmit, control, setValue, getValues, trigger, formState: { isValid } } = useForm<FormValues>({
        mode: 'onChange',
        defaultValues: {
            startStation: null,
            segments: [{ viaLine: null, destinationStation: null }],
            calculationMode: "normal",
            searchType: "ticket",
        },
    });

    const { fields, append, replace } = useFieldArray({ control, name: "segments" });

    const formValues = useWatch({ control }) as FormValues;

    // React state hooks defined before workerRef / useEffect to satisfy ESLint variable declaration order
    const [result, setResult] = useState<KippuData | null>(null);
    const [serverTime, setServerTime] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const workerRef = useRef<Worker | null>(null);
    const [isWasmReady, setIsWasmReady] = useState(false);
    const calculationCountRef = useRef<number>(0);

    const [resultPass, setResultPass] = useState<{
        fare: number;
        barrierFreeFee: number;
        charge: number;
        totalEigyoKilo: number;
        printedViaLines?: string[];
    } | null>(null);
    const [correctedStartPass, setCorrectedStartPass] = useState<string>("");
    const [correctedEndPass, setCorrectedEndPass] = useState<string>("");

    useEffect(() => {
        if (typeof window === "undefined") return;

        const initWorker = () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            setIsWasmReady(false);

            const worker = new Worker(new URL("../../split/split-pass.worker.ts", import.meta.url));
            workerRef.current = worker;
            calculationCountRef.current = 0;

            worker.onmessage = (e) => {
                const { type, result: wResult, error: wError } = e.data;
                if (type === "ready") {
                    setIsWasmReady(true);
                } else if (type === "success_route_pass") {
                    setResultPass(wResult);
                    if (wResult.correctedPath) {
                        setCorrectedStartPass(wResult.correctedPath[0] || "");
                        setCorrectedEndPass(wResult.correctedPath[wResult.correctedPath.length - 1] || "");
                    }
                    setIsLoading(false);

                    calculationCountRef.current += 1;
                    if (calculationCountRef.current >= 10) {
                        console.log("Recycling Web Worker to reclaim Wasm linear memory...");
                        initWorker();
                    }
                } else if (type === "error") {
                    setError(wError);
                    setIsLoading(false);
                }
            };
        };

        initWorker();

        return () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
        };
    }, []);

    // 初期ルート/パラメータによるフォーム状態の復元
    useEffect(() => {
        let startStation: Station | null = null;
        let initialSegments: { viaLine: Line | null; destinationStation: Station | null }[] = [{ viaLine: null, destinationStation: null }];

        if (initialRoute) {
            const parsed = parseRoute(initialRoute, stationData as Station[], lineData as Line[]);
            if (parsed?.startStation) {
                startStation = parsed.startStation;
                if (parsed.segments.length > 0) {
                    initialSegments = parsed.segments;
                }
            }
        } else {
            if (initialFrom) {
                const matchedFrom = stationMap.get(initialFrom) || stationData.find(s => s.name === initialFrom);
                if (matchedFrom) startStation = matchedFrom;
            }
            if (initialTo) {
                const matchedTo = stationMap.get(initialTo) || stationData.find(s => s.name === initialTo);
                if (matchedTo) {
                    initialSegments = [{ viaLine: null, destinationStation: matchedTo }];
                }
            }
        }

        if (startStation) {
            setValue("startStation", startStation);
        }
        if (initialSegments.length > 0 && initialSegments[0].destinationStation !== null) {
            replace(initialSegments);
        }
        if (initialSearchType) {
            setValue("searchType", initialSearchType);
        }
        if (initialCalculationMode) {
            setValue("calculationMode", initialCalculationMode);
        }

        if (startStation && initialSegments[0].destinationStation) {
            setTimeout(() => {
                trigger();
            }, 100);
        }
    }, [initialRoute, initialFrom, initialTo, initialSearchType]);

    // PostHog 計測用 useEffect (計算結果またはエラーが返ってきたタイミングで実行)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const startStation = getValues("startStation");
        const segments = getValues("segments");
        const currentSearchType = getValues("searchType") || "ticket";
        const calculationMode = getValues("calculationMode") || "normal";
        const currentFrom = startStation?.name;
        const lastSegment = segments?.[segments.length - 1];
        const currentTo = lastSegment?.destinationStation?.name;

        if (currentFrom && currentTo) {
            // 経路文字列を生成
            const route = stringifyRoute(startStation, segments || []);
            const currentSearchKey = `${route}_${currentSearchType}`;

            // 同じ検索条件での重複送信を防止
            if (lastTrackedSearch.current !== currentSearchKey) {
                // 1. 乗車券の計算結果が返ってきた場合
                if (result) {
                    const eventParams = {
                        search_type: currentSearchType,
                        calculation_mode: calculationMode,
                        route,
                        fare: result.fare,
                    };

                    const runTracking = () => {
                        if (posthog) {
                            posthog.capture("search_fare", eventParams);
                        }
                    };

                    if (typeof window.requestIdleCallback === "function") {
                        window.requestIdleCallback(runTracking);
                    } else {
                        setTimeout(runTracking, 50);
                    }

                    lastTrackedSearch.current = currentSearchKey;
                }
                // 2. 定期券の計算結果が返ってきた場合
                else if (resultPass) {
                    const eventParams = {
                        search_type: currentSearchType,
                        calculation_mode: calculationMode,
                        route,
                        fare: resultPass.fare,
                    };

                    const runTracking = () => {
                        if (posthog) {
                            posthog.capture("search_fare", eventParams);
                        }
                    };

                    if (typeof window.requestIdleCallback === "function") {
                        window.requestIdleCallback(runTracking);
                    } else {
                        setTimeout(runTracking, 50);
                    }

                    lastTrackedSearch.current = currentSearchKey;
                }
                // 3. エラーが返ってきた場合
                else if (error) {
                    const errorParams = {
                        search_type: currentSearchType,
                        calculation_mode: calculationMode,
                        route,
                        error_type: "calculation_error",
                        error_message: error,
                    };

                    const runTrackingError = () => {
                        if (posthog) {
                            posthog.capture("search_error", errorParams);
                        }
                    };

                    if (typeof window.requestIdleCallback === "function") {
                        window.requestIdleCallback(runTrackingError);
                    } else {
                        setTimeout(runTrackingError, 50);
                    }

                    lastTrackedSearch.current = currentSearchKey;
                }
            }
        }
    }, [result, resultPass, error, posthog, getValues]);

    const currentType = formValues.searchType;
    const isPeriodDisabled = currentType === "ticket";

    // クライアント側での経路展開 (重複チェック用)
    const getAllStations = (start: Station | null, segments: typeof formValues.segments): string[] => {
        if (!start) return [];
        if (segments.length === 0) return [start.name];

        const rawStations: string[] = [];
        let prevStationName = start.name;

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const destStation = segment.destinationStation;
            const line = segment.viaLine;

            if (!destStation || !line) {
                continue;
            }

            const matchLine = lineData.find(l => l.name === line.name);
            if (!matchLine) {
                continue;
            }

            const stationsOnLine = matchLine.stations;
            const startIdx = stationsOnLine.indexOf(prevStationName);
            const endIdx = stationsOnLine.indexOf(destStation.name);

            if (startIdx === -1 || endIdx === -1) {
                rawStations.push(destStation.name);
                prevStationName = destStation.name;
                continue;
            }

            let segmentStations: string[];
            if (startIdx < endIdx) {
                segmentStations = stationsOnLine.slice(startIdx, endIdx + 1);
            } else {
                segmentStations = stationsOnLine.slice(endIdx, startIdx + 1).reverse();
            }

            if (line.name === "新幹線") {
                segmentStations = segmentStations.filter((station) => station !== "大阪");
            }

            if (rawStations.length > 0 && segmentStations.length > 0 && rawStations[rawStations.length - 1] === segmentStations[0]) {
                segmentStations.shift();
            }

            rawStations.push(...segmentStations);
            prevStationName = destStation.name;
        }

        const stations: string[] = [];
        for (let i = 0; i < rawStations.length - 1; i++) {
            const currentName = rawStations[i];
            const nextName = rawStations[i + 1];

            stations.push(currentName);

            const matchedRule = SKIP_SECTION_RULES.find((rule: string[]) => {
                const first = rule[0];
                const last = rule[rule.length - 1];
                return (
                    (first === currentName && last === nextName) ||
                    (last === currentName && first === nextName)
                );
            });

            if (matchedRule) {
                const intermediates = matchedRule.slice(1, -1);
                if (matchedRule[0] === currentName) {
                    stations.push(...intermediates);
                } else {
                    stations.push(...[...intermediates].reverse());
                }
            }
        }
        if (rawStations.length > 0) {
            stations.push(rawStations[rawStations.length - 1]);
        }

        return stations;
    };

    // リアルタイムバリデーション: 重複経路チェック
    const allStations = getAllStations(formValues.startStation, formValues.segments || []);
    const hasConsecutiveSameStation = allStations.some((st, i) => i > 0 && st === allStations[i - 1]);
    const isDuplicateRoute = (allStations.length > 1 && new Set(allStations.slice(0, -1)).size !== allStations.length - 1) ||
        (allStations.length >= 3 && allStations[allStations.length - 3] === allStations[allStations.length - 1]);

    const isPass = currentType && currentType !== "ticket";
    const hasShinkansen = isPass && (formValues.segments || []).some(seg => seg.viaLine && SHINKANSEN_LINES.has(seg.viaLine.name));

    const updateUrlAndState = (nextPath: string, nextSearchType: SearchType) => {
        setValue("searchType", nextSearchType, { shouldValidate: true });

        const currentStart = getValues("startStation");
        const currentSegs = getValues("segments");

        const routeStr = stringifyRoute(currentStart, currentSegs);
        const newParams = new URLSearchParams();

        if (routeStr) {
            newParams.set("route", routeStr);
        }

        const calcMode = getValues("calculationMode") || initialCalculationMode || "normal";
        newParams.set("mode", calcMode);

        if (nextSearchType !== "ticket") {
            const monthsMap: Record<string, string> = { pass1: "1", pass3: "3", pass6: "6" };
            const mVal = monthsMap[nextSearchType] || "6";
            newParams.set("month", mVal);
        }

        const queryString = decodeURIComponent(newParams.toString());
        const newUrl = queryString ? `${nextPath}?${queryString}` : nextPath;

        if (nextPath !== pathname) {
        router.push(newUrl, { scroll: false });
        } else {
            window.history.replaceState(null, "", newUrl);
        }
    };

    const handleTabChange = (tab: "ticket" | "pass") => {
        setResult(null);
        setResultPass(null);
        setCorrectedStartPass("");
        setCorrectedEndPass("");
        setError(null);
        setServerTime(null);

        const nextPath = tab === "ticket" ? "/fare/ticket" : "/fare/pass";
        const nextSearchType: SearchType = tab === "ticket" ? "ticket" : "pass6";

        updateUrlAndState(nextPath, nextSearchType);
    };

    const handlePeriodChange = (period: "pass1" | "pass3" | "pass6") => {
        setResult(null);
        setResultPass(null);
        setCorrectedStartPass("");
        setCorrectedEndPass("");
        setError(null);
        setServerTime(null);

        updateUrlAndState(pathname, period);
    };

    const lastSegment = formValues.segments?.[formValues.segments?.length - 1];
    const lastDestination = lastSegment?.destinationStation;

    const isUnderPathLimit = (formValues.segments?.length ?? 0) < 3000;

    const canAddTransfer = (lastDestination ? (lastDestination.lines?.length ?? 0) > 1 : false) && isUnderPathLimit;

    const canReverse = !!formValues.startStation &&
        (formValues.segments?.length ?? 0) > 0 &&
        formValues.segments.every((seg: { viaLine: Line | null, destinationStation: Station | null }) =>
            seg.viaLine &&
            seg.destinationStation &&
            seg.viaLine.stations?.includes(seg.destinationStation.name)
        );

    const handleFieldChange = (
        value: SingleValue<Station | Line>,
        fieldOnChange: (value: SingleValue<Station | Line>) => void,
        resetLogic: () => void
    ) => {
        fieldOnChange(value);
        resetLogic();
    };

    const resetOnStartStationChange = () => {
        setValue("segments", [{ viaLine: null, destinationStation: null }]);
    };

    const resetOnViaLineChange = (index: number) => {
        setValue(`segments.${index}.destinationStation`, null);
        const newSegments = getValues("segments").slice(0, index + 1);
        setValue("segments", newSegments);
    };

    const resetOnDestinationStationChange = (index: number) => {
        const newSegments = getValues("segments").slice(0, index + 1);
        setValue("segments", newSegments);
    };

    const addSegment = () => {
        append({ viaLine: null, destinationStation: null });
    };

    // フォームの入力値のみを逆転させる処理
    const handleReverseRoute = () => {
        if (!canReverse) return;

        const currentStart = getValues("startStation");
        const currentSegments = getValues("segments");

        if (!currentStart) return;

        const reversedSegments = [];
        const newStart = currentSegments[currentSegments.length - 1].destinationStation;

        for (let i = currentSegments.length - 1; i >= 0; i--) {
            const dest = i === 0 ? currentStart : currentSegments[i - 1].destinationStation;
            const startStationOfSeg = currentSegments[i].destinationStation;
            let line = currentSegments[i].viaLine;

            if (line && startStationOfSeg) {
                const lineName = line.name;
                const isYamanote = lineName.includes("山手線");
                const isKanjosen = lineName.includes("環状線");

                if (isYamanote || isKanjosen) {
                    const prefix = isYamanote ? "山手線" : "環状線";
                    const isOuter = lineName.includes("外");
                    const isInner = lineName.includes("内");
                    const targetDirection = isOuter ? "内" : isInner ? "外" : null;

                    if (targetDirection) {
                        const fullStation = stationMap.get(startStationOfSeg.name) || startStationOfSeg;
                        const matchedLineName = fullStation.lines?.find(
                            l => l.includes(prefix) && l.includes(targetDirection)
                        );
                        if (matchedLineName) {
                            const newLine = lineData.find(l => l.name === matchedLineName);
                            if (newLine) {
                                line = newLine;
                            }
                        }
                    }
                }
            }

            reversedSegments.push({ viaLine: line, destinationStation: dest });
        }

        setValue("startStation", newStart, { shouldValidate: true });
        replace(reversedSegments);
        trigger();
    };

    const createApiRequestBody = (data: FormValues) => {
        if (data.startStation == null) {
            return null;
        }

        const path: PathStep[] = [];

        path.push({
            stationName: data.startStation.name,
            lineName: data.segments[0]?.viaLine?.name ?? null,
        });

        data.segments.forEach((segment, index) => {
            if (segment.destinationStation) {
                const nextLine = data.segments[index + 1]?.viaLine?.name ?? null;
                path.push({
                    stationName: segment.destinationStation.name,
                    lineName: nextLine
                });
            }
        });

        const fullPath: PathStep[] = [];

        for (let i = 0; i < path.length - 1; i++) {
            const startStep = path[i];
            const endStep = path[i + 1];
            const lineName = startStep.lineName!;
            const line = getLineByName(lineName);
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
            fullPath[i].lineName = getKana(fullPath[i].lineName!, fullPath[i].stationName, fullPath[i + 1].stationName);
        }

        return {
            fullPath,
            calculationMode: data.calculationMode,
            searchType: data.searchType
        };
    };

    const onSubmit: SubmitHandler<FormValues> = async (data) => {
        setIsLoading(true);
        setError(null);
        setResult(null);
        setResultPass(null);
        setCorrectedStartPass("");
        setCorrectedEndPass("");
        setServerTime(null);

        // 検索実行時に URL にクエリパラメータ route / month を付与・更新
        updateUrlAndState(pathname, data.searchType);

        const apiRequestBody = createApiRequestBody(data);

        if (!apiRequestBody) {
            setError("経路が不完全です。");
            setIsLoading(false);
            return;
        }

        let stations = new Set<string>();
        for (let i = 0; i < apiRequestBody.fullPath.length; i++) {
            stations.add(apiRequestBody.fullPath[i].stationName);
        }
        if (!apiRequestBody || apiRequestBody.fullPath.length < 2 || stations.size === 1) {
            setError('不正な経路です');
            setIsLoading(false);
            return;
        }

        const isPass = data.searchType && data.searchType !== "ticket";
        if (isPass) {
            const startName = apiRequestBody.fullPath[0].stationName;
            const endName = apiRequestBody.fullPath[apiRequestBody.fullPath.length - 1].stationName;
            if (TEMPORARY_STATIONS.includes(startName) || TEMPORARY_STATIONS.includes(endName)) {
                setError('臨時駅発着の定期券は計算できません');
                setIsLoading(false);
                return;
            }

            const stationNames = apiRequestBody.fullPath
                .map(p => p.stationName)
                .filter(name => !TEMPORARY_STATIONS.includes(name));
            const firstPart = stationNames.slice(0, -1);
            const hasDuplicateInFirstPart = firstPart.some((name, index) => firstPart.indexOf(name) !== index);
            if (hasDuplicateInFirstPart) {
                setError('経路が重複しています。');
                setIsLoading(false);
                return;
            }

            if (!workerRef.current || !isWasmReady) {
                setError("計算エンジン (Web Worker) が初期化されていません。しばらく待ってから再度お試しください。");
                setIsLoading(false);
                return;
            }

            const monthsMap: Record<string, number> = { pass1: 1, pass3: 3, pass6: 6 };
            const months = monthsMap[data.searchType] || 1;

            workerRef.current.postMessage({
                type: "calculateRoutePass",
                payload: {
                    stationNames,
                    calculationMode: data.calculationMode,
                    months,
                    isIc: false
                }
            });
            return;
        }

        try {
            const response = await fetch('/api/fare', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiRequestBody),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "サーバーエラーが発生しました。");
            }

            const responseData = await response.json();
            if (responseData.data) {
                setResult(responseData.data);
                setServerTime(responseData.time);
                setIsLoading(false);
            } else {
                throw new Error("サーバーからのレスポンス形式が不正です。");
            }

        } catch (err) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError("計算に失敗しました。");
            }
            setIsLoading(false);
        }
    };

    return (
        <>
            {/* 第1階層: 乗車券・定期券切り替えタブ */}
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl mb-4">
                <button
                    type="button"
                    onClick={() => handleTabChange("ticket")}
                    className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center ${currentType === "ticket"
                        ? "bg-white text-blue-600 shadow-sm font-bold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        }`}
                >
                    {"乗車券"}
                </button>
                <button
                    type="button"
                    onClick={() => handleTabChange("pass")}
                    className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center ${currentType !== "ticket"
                        ? "bg-white text-blue-600 shadow-sm font-bold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        }`}
                >
                    {"定期券"}
                </button>
            </div>

            {/* 第2階層: 定期券期間選択トグル */}
            <div className="h-11 mb-6">
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-50 border border-slate-200 rounded-xl">
                    <button
                        type="button"
                        onClick={() => handlePeriodChange("pass1")}
                        disabled={isPeriodDisabled}
                        className={`py-1.5 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all text-center ${!isPeriodDisabled && currentType === "pass1"
                            ? "bg-white text-blue-600 shadow-sm font-bold cursor-pointer"
                            : isPeriodDisabled
                                ? "text-slate-400 cursor-not-allowed opacity-50"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/30 cursor-pointer"
                            }`}
                    >
                        {"1箇月"}
                    </button>
                    <button
                        type="button"
                        onClick={() => handlePeriodChange("pass3")}
                        disabled={isPeriodDisabled}
                        className={`py-1.5 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all text-center ${!isPeriodDisabled && currentType === "pass3"
                            ? "bg-white text-blue-600 shadow-sm font-bold cursor-pointer"
                            : isPeriodDisabled
                                ? "text-slate-400 cursor-not-allowed opacity-50"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/30 cursor-pointer"
                            }`}
                    >
                        {"3箇月"}
                    </button>
                    <button
                        type="button"
                        onClick={() => handlePeriodChange("pass6")}
                        disabled={isPeriodDisabled}
                        className={`py-1.5 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all text-center ${!isPeriodDisabled && currentType === "pass6"
                            ? "bg-white text-blue-600 shadow-sm font-bold cursor-pointer"
                            : isPeriodDisabled
                                ? "text-slate-400 cursor-not-allowed opacity-50"
                                : "text-slate-500 hover:text-slate-800 hover:bg-white/30 cursor-pointer"
                            }`}
                    >
                        {"6箇月"}
                    </button>
                </div>
            </div>

            {/* eslint-disable-next-line react-hooks/refs */}
            <form onSubmit={handleSubmit(onSubmit)} className="w-full">
                <div className="flex flex-col w-full">

                    {/* 発駅 */}
                    <Controller
                        name="startStation"
                        control={control}
                        rules={{
                            required: "発駅を入力してください",
                            validate: (selected) => {
                                if (!selected) return "発駅を入力してください";
                                const exists = stationData.some(s => s.name === selected.name);
                                if (!exists) return "該当する駅が存在しません";
                                const currentSearchType = getValues("searchType");
                                if (currentSearchType !== "ticket" && TEMPORARY_STATIONS.includes(selected.name)) {
                                    return "臨時駅発着の定期券は計算できません";
                                }
                                return true;
                            }
                        }}
                        render={({ field, fieldState }) => (
                            <div className="flex flex-col w-full">
                                <div className="flex items-center gap-5 w-full whitespace-nowrap">
                                    <p className="w-12 shrink-0">発駅</p>
                                    <div className="flex-1 w-full min-w-0">
                                        <SelectStation
                                            instanceId="start-station"
                                            value={field.value}
                                            onChange={(value) => handleFieldChange(value, field.onChange, resetOnStartStationChange)}
                                            hideMenuWhenEmpty={true}
                                        />
                                    </div>
                                </div>
                                <div className="min-h-4 ml-17">
                                    {fieldState.error && (
                                        <p className="text-red-500 text-xs">
                                            {fieldState.error.message}
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}
                    />

                    {/* 経由路線と着駅 */}
                    {fields.map((item, index) => {
                        const previousStation = index === 0
                            ? formValues.startStation
                            : formValues.segments?.[index - 1]?.destinationStation;

                        const previousLine = index > 0 ? formValues.segments?.[index - 1]?.viaLine : null;

                        const availableLineNames = new Set(previousStation?.lines || []);

                        const availableLines = previousStation
                            ? lineData
                                .filter(line => availableLineNames.has(line.name))
                                .filter(line => !previousLine || line.name !== previousLine.name)
                            : [];

                        const selectedLine = formValues.segments?.[index]?.viaLine;

                        const stationsOnLine = selectedLine
                            ? (selectedLine.stations
                                .map(name => stationMap.get(name))
                                .filter(station => station !== undefined) as Station[])
                            : [];

                        const isLastStation = index === fields.length - 1;
                        const stationLabel = isLastStation ? "着駅" : "経由";

                        return (
                            <div key={item.id} className="flex flex-col gap-4 w-full">
                                {/* 路線（ラベルなしで、コンテナ幅いっぱいに広げる） */}
                                <div className="w-full">
                                    <Controller
                                        name={`segments.${index}.viaLine`}
                                        control={control}
                                        rules={{ required: "経由路線を選択してください" }}
                                        render={({ field, fieldState }) => (
                                            <div className="w-full">
                                                <SelectLine
                                                    instanceId={`via-line-${index}`}
                                                    options={availableLines}
                                                    isDisabled={!previousStation}
                                                    value={field.value}
                                                    onChange={(value) => handleFieldChange(value, field.onChange, () => resetOnViaLineChange(index))}
                                                />
                                                {fieldState.error && <p className="text-red-500 text-xs mt-1">{fieldState.error.message}</p>}
                                            </div>
                                        )}
                                    />
                                </div>

                                {/* 駅 */}
                                <Controller
                                    name={`segments.${index}.destinationStation`}
                                    control={control}
                                    rules={{
                                        required: `${stationLabel}を入力してください`,
                                        validate: (selected) => {
                                            if (!selected) return `${stationLabel}を入力してください`;
                                            if (previousStation && previousStation.name === selected.name) {
                                                return "路線の前後で同じ駅は選択できません";
                                            }
                                            const exists = stationsOnLine.some(s => s.name === selected.name);
                                            if (!exists) return "選択された路線にこの駅は存在しません";

                                            const currentSearchType = getValues("searchType");
                                            if (currentSearchType !== "ticket" && isLastStation && TEMPORARY_STATIONS.includes(selected.name)) {
                                                return "臨時駅発着の定期券は計算できません";
                                            }
                                            return true;
                                        }
                                    }}
                                    render={({ field, fieldState }) => (
                                        <div className="flex flex-col w-full">
                                            <div className="flex items-center gap-5 w-full whitespace-nowrap">
                                                <p className="w-12 shrink-0">{stationLabel}</p>
                                                <div className="flex-1 w-full min-w-0">
                                                    <SelectStation
                                                        instanceId={`dest-station-${index}`}
                                                        options={stationsOnLine}
                                                        isDisabled={!selectedLine}
                                                        value={field.value}
                                                        onChange={(value) => handleFieldChange(value, field.onChange, () => resetOnDestinationStationChange(index))}
                                                    />
                                                </div>
                                            </div>
                                            <div className="min-h-4 ml-17">
                                                {fieldState.error && (
                                                    <p className="text-red-500 text-xs">
                                                        {fieldState.error.message}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                />
                            </div>
                        );
                    })}

                    {isDuplicateRoute && (
                        <p className="text-red-500 text-sm">
                            経路が重複しています
                        </p>
                    )}

                    {hasShinkansen && (
                        <p className="text-red-500 text-sm">
                            定期券では新幹線を経由することができません
                        </p>
                    )}

                    {/* 経路追加 ＆ 経路逆転 ボタン群 */}
                    <div className="flex items-center flex-wrap gap-3 my-2 w-full">
                        <button
                            type="button"
                            onClick={addSegment}
                            disabled={!canAddTransfer || isDuplicateRoute || hasConsecutiveSameStation || hasShinkansen}
                            className="px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600 disabled:bg-slate-300 transition-colors shadow-sm whitespace-nowrap"
                            title={hasShinkansen ? "定期券では新幹線を経由するがことはできません" : !isUnderPathLimit ? "経路数の上限（3000件）に達しました" : "前の駅で乗り換え可能な路線がある場合に追加できます"}
                        >
                            {"経由路線を追加"}
                        </button>
                        <button
                            type="button"
                            onClick={handleReverseRoute}
                            disabled={!canReverse}
                            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"
                            title="入力フォームの発着駅と経路を逆転させます"
                        >
                            <RiArrowUpDownLine className="w-5 h-5" />
                            {"経路を逆転"}
                        </button>
                    </div>

                    {/* 運賃計算モード選択（ラジオボタン） */}
                    <div className="my-4 flex flex-col items-start bg-slate-50 p-4 rounded-md border border-slate-200 w-full">
                        <p className="block text-base font-bold text-slate-700 mb-3">
                            {"運賃計算モード"}
                        </p>
                        <div className="flex flex-col gap-3 w-full px-2">
                            <label className="inline-flex items-center cursor-pointer w-fit">
                                <input
                                    type="radio"
                                    value="normal"
                                    className="w-4 h-4 text-blue-600 bg-white border-gray-300 focus:ring-blue-500"
                                    {...register("calculationMode", {
                                        onChange: () => updateUrlAndState(pathname, currentType)
                                    })}
                                />
                                <span className="ms-3 text-base font-medium text-slate-700">
                                    通常 <span className="text-sm text-slate-500 font-normal">（発売可能なルートに自動補正）</span>
                                </span>
                            </label>

                            <label className="inline-flex items-center cursor-pointer w-fit">
                                <input
                                    type="radio"
                                    value="cheapest"
                                    className="w-4 h-4 text-blue-600 bg-white border-gray-300 focus:ring-blue-500"
                                    {...register("calculationMode", {
                                        onChange: () => updateUrlAndState(pathname, currentType)
                                    })}
                                />
                                <span className="ms-3 text-base font-medium text-slate-700">
                                    最安 <span className="text-sm text-slate-500 font-normal">（経路を延長して安くなる場合は適用）</span>
                                </span>
                            </label>

                            <label className="inline-flex items-center cursor-pointer w-fit">
                                <input
                                    type="radio"
                                    value="uncorrect"
                                    className="w-4 h-4 text-blue-600 bg-white border-gray-300 focus:ring-blue-500"
                                    {...register("calculationMode", {
                                        onChange: () => updateUrlAndState(pathname, currentType)
                                    })}
                                />
                                <span className="ms-3 text-base font-medium text-slate-700">
                                    補正禁止 <span className="text-sm text-red-500 font-normal">※上級者向け</span><span className="text-sm text-slate-500 font-normal">（入力経路のまま計算）</span>
                                </span>
                            </label>
                        </div>
                    </div>

                    <button
                        type="submit"
                        className="w-full px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-white transition-colors mt-2 cursor-pointer disabled:cursor-not-allowed"
                        disabled={!isValid || isDuplicateRoute || hasConsecutiveSameStation || isLoading || (currentType !== "ticket" && !isWasmReady) || hasShinkansen}
                    >
                        {isLoading
                            ? "計算中..."
                            : (currentType !== "ticket" && !isWasmReady)
                                ? "計算エンジン初期化中..."
                                : "運賃計算をする"
                        }
                    </button>
                </div>
            </form>

            <div className="my-8 p-4">
                {isLoading && <p className="py-5 border-t text-center text-gray-500">計算中...</p>}
                {!isLoading && serverTime && <p className="text-right text-xs text-gray-400">計算時間: {serverTime}ms</p>}

                {!isLoading && error && <p className="py-5 border-t text-red-500 text-center">{error}</p>}

                {!isLoading && result && (
                    <div>
                        <h2 className="py-5 text-2xl border-t">計算結果</h2>
                        <div>営業キロ: {(result.totalEigyoKilo / 10).toFixed(1)} km</div>
                        <div className="flex justify-between items-center my-3 gap-2">
                            <div className="flex-1 text-right">
                                <div className={`font-bold flex justify-around flex-wrap ${result.departureStation.length > 6 ? 'text-lg sm:text-xl' : 'text-2xl'}`}>
                                    {result.departureStation.split('').map((char, idx) => (
                                        <span key={idx}>{char}</span>
                                    ))}
                                </div>
                            </div>

                            <div className="text-2xl shrink-0 text-center text-slate-400">→</div>

                            <div className="flex-1 text-left text-wrap">
                                <div className={`font-bold flex justify-around flex-wrap ${result.arrivalStation.length > 6 ? 'text-lg sm:text-xl' : 'text-2xl'}`}>
                                    {result.arrivalStation.split('').map((char, idx) => (
                                        <span key={idx}>{char}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <span>経由：{result.printedViaLines.length === 0 ? "ーーー" : result.printedViaLines.join("・")}</span>
                        <span className="flex justify-between items-center mt-2">
                            <span>{result.validDays + " 日間有効"}</span>
                            <span className="text-xl">¥{result.fare > 0 ? result.fare.toLocaleString() : "***"}</span>
                        </span>
                    </div>
                )}

                {!isLoading && resultPass && (
                    <div>
                        <h2 className="py-5 text-2xl border-t">計算結果</h2>
                        <div>営業キロ: {(resultPass.totalEigyoKilo / 10).toFixed(1)} km</div>
                        <div className="flex justify-between items-center my-3 gap-2">
                            <div className="flex-1 text-right">
                                <div className={`font-bold flex justify-around flex-wrap ${correctedStartPass.length > 6 ? 'text-lg sm:text-xl' : 'text-2xl'}`}>
                                    {correctedStartPass.split('').map((char, idx) => (
                                        <span key={idx}>{char}</span>
                                    ))}
                                </div>
                            </div>

                            <div className="text-2xl shrink-0 text-center text-slate-400">↔</div>

                            <div className="flex-1 text-left text-wrap">
                                <div className={`font-bold flex justify-around flex-wrap ${correctedEndPass.length > 6 ? 'text-lg sm:text-xl' : 'text-2xl'}`}>
                                    {correctedEndPass.split('').map((char, idx) => (
                                        <span key={idx}>{char}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <span>経由：{!resultPass.printedViaLines || resultPass.printedViaLines.length === 0 ? "ーーー" : resultPass.printedViaLines.join("・")}</span>
                        <span className="flex justify-between items-center mt-2">
                            <span>{(({ pass1: 1, pass3: 3, pass6: 6 } as Record<string, number>)[formValues.searchType] || 1) + " 箇月有効"}</span>
                            <span className="text-xl">¥{(resultPass.fare + resultPass.barrierFreeFee + resultPass.charge).toLocaleString()}</span>
                        </span>
                    </div>
                )}
            </div>
            <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
                <h3 className="font-bold text-gray-600 mb-2">💡 当システムについて</h3>
                <p className="mb-4 leading-relaxed">
                    {"出発駅と到着駅、および経由する路線を入力するだけで、JRの運賃を計算するプログラムです。"}
                </p>

                <h3 className="font-bold text-gray-600 mb-2">ご利用手順</h3>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li><strong>駅・路線の入力:</strong> 発駅から着駅までの経路を入力してください。</li>
                    <li><strong>経路の追加:</strong> 「経由路線を追加」ボタンで複数の路線を乗り継ぐことができます。</li>
                    <li><strong>経路の逆転:</strong> 経路を逆にしたい場合は「⇅ 経路を逆転」ボタンを押してください。</li>
                    <li><strong>運賃の計算:</strong> 「運賃計算をする」ボタンを押すと、営業キロと運賃が算出されます。</li>
                </ol>
            </div>
        </>
    );
}
