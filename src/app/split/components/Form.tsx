"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { useForm, Controller, SubmitHandler, useWatch } from "react-hook-form";
import { RiArrowUpDownLine } from "react-icons/ri";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { useRouter, usePathname } from "next/navigation";
import { usePostHog } from "posthog-js/react";

import stationDatas from "@/app/split/data/stationDatas.json";
import SelectStation from "@/app/split/components/SelectStation";
import { SearchOption, SearchType, SplitApiResponse, Station, KippuData, SplitKippuData, SplitKippuDatas } from "@/app/types";
import { calculateAction } from "@/app/split/actions";

interface ExtendedSplitFormInput {
    startStation: Station | null;
    endStation: Station | null;
    searchType: SearchType;
}

interface SplitFormProps {
    initialFrom?: string;
    initialTo?: string;
    initialSearchType?: string;
    result?: SplitApiResponse | null;
    error?: string | null;
    serverTime?: number | null;
}

const SEARCH_TYPE_OPTIONS: SearchOption[] = [
    { value: "ticket", label: "普通乗車券" },
    { value: "pass1", label: "通勤定期券１箇月" },
    { value: "pass3", label: "通勤定期券３箇月" },
    { value: "pass6", label: "通勤定期券６箇月" },
];

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
    "バルーンさが",
];

interface WasmSegment {
    start: string;
    end: string;
    path: string[];
    via: string[];
    totalEigyoKilo?: number;
    result?: {
        Fare: number;
        BarrierFreeFee: number;
        Charge: number;
    };
}

interface WasmResultResponse {
    totalAmount: number;
    segments: WasmSegment[];
}

interface WasmClientResponse {
    normal: WasmResultResponse;
    results: WasmResultResponse[];
}

function adaptWasmResponseToSplitApiResponse(wasmRes: WasmClientResponse): SplitApiResponse {
    const normalSegs = wasmRes.normal?.segments || [];
    const cheapestKippuData: KippuData = {
        departureStation: normalSegs[0]?.start || "",
        arrivalStation: normalSegs[normalSegs.length - 1]?.end || "",
        totalEigyoKilo: normalSegs.reduce((sum: number, s: WasmSegment) => sum + (s.totalEigyoKilo || 0), 0),
        printedViaLines: normalSegs.flatMap((s: WasmSegment) => s.via || []),
        fare: wasmRes.normal?.totalAmount || 0,
        validDays: 0,
    };

    const splitKippuDatasList: SplitKippuDatas[] = (wasmRes.results || []).map((res: WasmResultResponse) => {
        const splitKippuDatas: SplitKippuData[] = (res.segments || []).map((seg: WasmSegment) => {
            const segFare = (seg.result?.Fare || 0) + (seg.result?.BarrierFreeFee || 0) + (seg.result?.Charge || 0);
            return {
                departureStation: seg.start,
                arrivalStation: seg.end,
                kippuData: {
                    departureStation: seg.path[0],
                    arrivalStation: seg.path[seg.path.length - 1],
                    totalEigyoKilo: seg.totalEigyoKilo || 0,
                    printedViaLines: seg.via || [],
                    fare: segFare,
                    validDays: 0,
                }
            };
        });

        return {
            totalFare: res.totalAmount || 0,
            splitKippuDatas
        };
    });

    return {
        cheapestKippuData,
        splitKippuDatasList
    };
}

export default function SplitForm({
    initialFrom,
    initialTo,
    initialSearchType,
    result: initialResult,
    error: initialError,
    serverTime: initialServerTime,
}: SplitFormProps) {
    const router = useRouter();
    const pathname = usePathname();
    const posthog = usePostHog();
    const [isPending, startTransition] = useTransition();

    const isIcPass = pathname === "/split-icpass";

    // ローカルでの計算結果・エラー・計測時間および検索タイプの管理State
    const [isCalculating, setIsCalculating] = useState(false);
    const [result, setResult] = useState<SplitApiResponse | null>(initialResult || null);
    const [error, setError] = useState<string | null>(initialError || null);
    const [serverTime, setServerTime] = useState<number | null>(initialServerTime || null);
    const [searchedType, setSearchedType] = useState<SearchType>(
        (initialSearchType === "pass1" || initialSearchType === "pass3" || initialSearchType === "pass6")
            ? initialSearchType
            : (isIcPass ? "pass1" : "ticket")
    );

    const lastTrackedSearch = useRef<string>("");

    const workerRef = useRef<Worker | null>(null);
    const [isWasmReady, setIsWasmReady] = useState(false);
    const calculationCountRef = useRef<number>(0);

    useEffect(() => {
        if (typeof window === "undefined") return;

        const initWorker = () => {
            if (workerRef.current) {
                workerRef.current.terminate();
                workerRef.current = null;
            }
            setIsWasmReady(false);

            const worker = new Worker(new URL("../split-pass.worker.ts", import.meta.url));
            workerRef.current = worker;
            calculationCountRef.current = 0;

            worker.onmessage = (e) => {
                const { type, result, error } = e.data;
                if (type === "ready") {
                    setIsWasmReady(true);
                } else if (type === "success") {
                    const adaptedResult = adaptWasmResponseToSplitApiResponse(result);
                    setResult(adaptedResult);
                    setIsCalculating(false);

                    calculationCountRef.current += 1;
                    // 10回の計算毎にWorkerをリサイクルしてWasmリニアメモリを解放
                    if (calculationCountRef.current >= 10) {
                        console.log("Recycling Web Worker to reclaim Wasm linear memory...");
                        initWorker();
                    }
                } else if (type === "error") {
                    setError(error);
                    setIsCalculating(false);
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

    const initialStartStation = initialFrom ? stationDatas.find(s => s.name === initialFrom) || { name: initialFrom, kana: "" } : null;
    const initialEndStation = initialTo ? stationDatas.find(s => s.name === initialTo) || { name: initialTo, kana: "" } : null;

    const defaultSearchType = (initialSearchType === "pass1" || initialSearchType === "pass3" || initialSearchType === "pass6")
        ? initialSearchType
        : (isIcPass ? "pass1" : "ticket");

    const { handleSubmit, control, formState: { isValid, errors }, getValues, setValue, reset, trigger } = useForm<ExtendedSplitFormInput>({
        mode: "onChange",
        defaultValues: {
            startStation: initialStartStation,
            endStation: initialEndStation,
            searchType: defaultSearchType,
        },
    });

    useEffect(() => {
        const startStation = initialFrom ? stationDatas.find(s => s.name === initialFrom) || { name: initialFrom, kana: "" } : null;
        const endStation = initialTo ? stationDatas.find(s => s.name === initialTo) || { name: initialTo, kana: "" } : null;
        const currentSearchType = (initialSearchType === "pass1" || initialSearchType === "pass3" || initialSearchType === "pass6")
            ? initialSearchType
            : (isIcPass ? "pass1" : "ticket");

        reset({
            startStation,
            endStation,
            searchType: currentSearchType,
        });

        // ページ遷移後にバリデーションを再実行する（例: 磁気定期券→IC定期券切替時のエリアチェック）
        // reset() はバリデーションをトリガーしないため、明示的に trigger() を呼ぶ
        if (startStation || endStation) {
            // reset後にreact-hook-formの内部状態が更新されるのを待ってからtriggerする
            setTimeout(() => {
                trigger(["startStation", "endStation"]);
            }, 0);
        }
    }, [initialFrom, initialTo, initialSearchType, isIcPass, reset, trigger]);

    // GA4 & PostHog 計測用 useEffect (計算結果またはエラーが返ってきたタイミングで実行)
    useEffect(() => {
        if (typeof window === "undefined") return;

        const currentFrom = getValues("startStation")?.name;
        const currentTo = getValues("endStation")?.name;
        const currentSearchType = getValues("searchType") || "ticket";

        if (currentFrom && currentTo) {
            const currentSearchKey = `${currentFrom}_${currentTo}_${currentSearchType}`;

            // 同じ検索条件での重複送信を防止
            if (lastTrackedSearch.current !== currentSearchKey) {
                // 1. 正常に計算結果が返ってきた場合
                if (result) {
                    const normalFare = result.cheapestKippuData?.fare || 0;
                    const bestFare = result.splitKippuDatasList?.length > 0
                        ? result.splitKippuDatasList[0].totalFare
                        : normalFare;

                    const savedAmount = Math.max(0, normalFare - bestFare);
                    const isSaving = savedAmount > 0;

                    const eventParams = {
                        search_type: currentSearchType,
                        from_station: currentFrom,
                        to_station: currentTo,
                        is_saving: isSaving,
                        saved_amount: savedAmount
                    };

                    const runTracking = () => {
                        if (typeof window.gtag === "function") {
                            window.gtag("event", "search_split", eventParams);
                        }
                        if (posthog) {
                            posthog.capture("search_split", eventParams);
                        }
                    };

                    if (typeof window.requestIdleCallback === "function") {
                        window.requestIdleCallback(runTracking);
                    } else {
                        setTimeout(runTracking, 50);
                    }

                    lastTrackedSearch.current = currentSearchKey;
                }
                // 2. エラーが返ってきた場合
                else if (error) {
                    const errorParams = {
                        search_type: currentSearchType,
                        from_station: currentFrom,
                        to_station: currentTo,
                        error_type: "calculation_error",
                        error_message: error
                    };

                    const runTrackingError = () => {
                        if (typeof window.gtag === "function") {
                            window.gtag("event", "search_error", errorParams);
                        }
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
    }, [result, error, posthog, getValues]);

    const baseLabel = SEARCH_TYPE_OPTIONS.find(
        o => o.value === searchedType
    )?.label || "運賃";
    const searchedTypeLabel = (searchedType !== "ticket" && isIcPass) ? `IC${baseLabel}` : baseLabel;

    const [showAllPatterns, setShowAllPatterns] = useState(false);

    const startStationVal = useWatch({ control, name: "startStation" });
    const endStationVal = useWatch({ control, name: "endStation" });
    const currentType = useWatch({ control, name: "searchType" });

    const canSwap = !!startStationVal || !!endStationVal;
    const isPeriodDisabled = !isIcPass && currentType === "ticket";

    // 駅名が変更された際に、相互のバリデーションを再評価する
    useEffect(() => {
        if (startStationVal?.name || endStationVal?.name) {
            trigger(["startStation", "endStation"]);
        }
    }, [startStationVal?.name, endStationVal?.name, trigger]);

    const handleSwapStations = () => {
        const currentStart = getValues("startStation");
        const currentEnd = getValues("endStation");
        setValue("startStation", currentEnd, { shouldValidate: true });
        setValue("endStation", currentStart, { shouldValidate: true });
    };

    const stations = new Set((stationDatas as Station[]).map((s) => s.name))

    const validateStation = (value: Station | null, fieldName: "startStation" | "endStation") => {
        if (!value || !value.name) return false;
        const exists = stations.has(value.name);
        if (!exists) return "正しい駅名を選択または入力してください";

        const currentSearchType = getValues("searchType");
        const isPass = isIcPass || (currentSearchType !== "ticket");
        if (isPass && TEMPORARY_STATIONS.includes(value.name)) {
            return "臨時駅発着の定期券は計算できません";
        }

        // IC定期券の時のエリアバリデーション
        if (isIcPass) {
            const startVal = getValues("startStation");
            const endVal = getValues("endStation");
            const currentStationData = stationDatas.find(s => s.name === value.name);

            if (!currentStationData?.icPassAreaName) {
                return "この駅はIC定期券エリア外のため、IC定期券の計算はできません";
            }

            if (fieldName === "startStation" && endVal?.name) {
                const partnerStationData = stationDatas.find(s => s.name === endVal.name);
                if (partnerStationData?.icPassAreaName && currentStationData.icPassAreaName !== partnerStationData.icPassAreaName) {
                    return `エリアを跨ぐ計算はできません（${currentStationData.name}駅は${currentStationData.icPassAreaName}です）`;
                }
            } else if (fieldName === "endStation" && startVal?.name) {
                const partnerStationData = stationDatas.find(s => s.name === startVal.name);
                if (partnerStationData?.icPassAreaName && currentStationData.icPassAreaName !== partnerStationData.icPassAreaName) {
                    return `エリアを跨ぐ計算はできません（${currentStationData.name}駅は${currentStationData.icPassAreaName}です）`;
                }
            }
        }

        return true;
    };

    const handleTabChange = (tab: "ticket" | "magnetic-pass" | "ic-pass") => {
        setResult(null);
        setError(null);
        setServerTime(null);

        let nextPath = "/split";
        let nextSearchType: SearchType = "ticket";

        if (tab === "magnetic-pass") {
            nextSearchType = (currentType === "pass1" || currentType === "pass3" || currentType === "pass6")
                ? currentType
                : "pass1";
        } else if (tab === "ic-pass") {
            nextSearchType = (currentType === "pass1" || currentType === "pass3" || currentType === "pass6")
                ? currentType
                : "pass1";
            nextPath = "/split-icpass";
        }

        updateUrlAndState(nextPath, nextSearchType);
    };

    const handlePeriodChange = (period: "pass1" | "pass3" | "pass6") => {
        setResult(null);
        setError(null);
        setServerTime(null);

        const nextPath = isIcPass ? "/split-icpass" : "/split";
        updateUrlAndState(nextPath, period);
    };

    const updateUrlAndState = (nextPath: string, nextSearchType: SearchType) => {
        setValue("searchType", nextSearchType, { shouldValidate: true });
        trigger(["startStation", "endStation"]);

        const startStation = getValues("startStation");
        const endStation = getValues("endStation");

        const searchParams = new URLSearchParams();
        if (startStation?.name) searchParams.set("from", startStation.name);
        if (endStation?.name) searchParams.set("to", endStation.name);

        if (nextSearchType !== "ticket") {
            searchParams.set("searchType", nextSearchType);
        }

        const newUrl = `${nextPath}?${searchParams.toString()}`;

        // パスが変わる場合のみ router.push でルーティング遷移（例: /split ↔ /split-icpass）
        if (nextPath !== pathname) {
            startTransition(() => {
                router.push(newUrl, { scroll: false });
            });
        } else {
            // 同じページ内ならURLバーだけ更新
            window.history.replaceState(null, "", newUrl);
        }
    };

    const onSubmit: SubmitHandler<ExtendedSplitFormInput> = async (data) => {
        if (!data.startStation?.name || !data.endStation?.name) return;

        setShowAllPatterns(false);
        setError(null);
        setResult(null);
        setServerTime(null);
        setIsCalculating(true);

        const searchParams = new URLSearchParams();
        searchParams.set("from", data.startStation.name);
        searchParams.set("to", data.endStation.name);

        if (data.searchType && data.searchType !== "ticket") {
            searchParams.set("searchType", data.searchType);
        }

        const nextPath = isIcPass ? "/split-icpass" : "/split";
        const newUrl = `${nextPath}?${searchParams.toString()}`;
        // URLバーだけ更新
        window.history.replaceState(null, "", newUrl);

        // 検索タイプの確定
        setSearchedType(data.searchType);

        try {
            const res = await calculateAction(
                data.startStation.name,
                data.endStation.name,
                data.searchType,
                isIcPass
            );
            if (res.error) {
                setError(res.error);
                setIsCalculating(false);
            } else if (res.result && "passStations" in res.result) {
                const { passStations } = res.result as { passStations: { normal: string[], results: string[][] } };

                if (!workerRef.current) {
                    setError("計算エンジン (Web Worker) が初期化されていません。しばらく待ってから再度お試しください。");
                    setIsCalculating(false);
                    return;
                }

                const monthsMap: Record<string, number> = { pass1: 1, pass3: 3, pass6: 6 };
                const months = monthsMap[data.searchType] || 1;

                const splitPaths = (passStations.results && passStations.results.length > 0)
                    ? passStations.results
                    : [passStations.normal];

                workerRef.current.postMessage({
                    type: "calculate",
                    payload: {
                        splitPaths,
                        months,
                        isIc: isIcPass
                    }
                });

                // APIの応答時間をサーバー時間として設定 (Wasm復元は極めて高速なため、大半がAPI通信時間)
                setServerTime(res.serverTime || null);
            } else {
                setResult(res.result || null);
                setServerTime(res.serverTime || null);
                setIsCalculating(false);
            }
        } catch (err: unknown) {
            if (err instanceof Error) {
                setError(err.message);
            } else {
                setError(String(err));
            }
            setIsCalculating(false);
        }
    };

    return (
        <main className="max-w-2xl mx-auto w-full">
            {/* 第1階層: 目的選択タブ */}
            <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl mb-4">
                <button
                    type="button"
                    onClick={() => handleTabChange("ticket")}
                    className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center ${!isIcPass && currentType === "ticket"
                        ? "bg-white text-blue-600 shadow-sm font-bold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        }`}
                >
                    普通乗車券
                </button>
                <button
                    type="button"
                    onClick={() => handleTabChange("magnetic-pass")}
                    className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center ${!isIcPass && currentType !== "ticket"
                        ? "bg-white text-blue-600 shadow-sm font-bold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        }`}
                >
                    磁気定期券
                </button>
                <button
                    type="button"
                    onClick={() => handleTabChange("ic-pass")}
                    className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center ${isIcPass
                        ? "bg-white text-blue-600 shadow-sm font-bold"
                        : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                        }`}
                >
                    IC定期券
                </button>
            </div>

            {/* 第2階層: 期間選択トグル */}
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
                        1箇月
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
                        3箇月
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
                        6箇月
                    </button>
                </div>
            </div>

            {/* eslint-disable-next-line react-hooks/refs */}
            <form onSubmit={handleSubmit(onSubmit)} className="w-full">
                <div className="flex flex-col gap-4 w-full">

                    <div className="flex flex-col w-full">
                        <div className="flex items-center gap-5 w-full">
                            <p className="w-12 shrink-0 whitespace-nowrap">発駅</p>
                            <div className="flex-1 w-full min-w-0">
                                <Controller
                                    name="startStation"
                                    control={control}
                                    rules={{ validate: (v) => validateStation(v, "startStation") }}
                                    render={({ field }) => (
                                        <SelectStation
                                            instanceId="start-station-split"
                                            {...field}
                                            options={stationDatas}
                                        />
                                    )}
                                />
                            </div>
                        </div>
                        <div className="min-h-[24px] mt-1 ml-17">
                            {errors.startStation && (
                                <p className="text-red-500 text-xs">
                                    {errors.startStation.message}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="flex justify-center w-full -my-3 relative z-0">
                        <button
                            type="button"
                            onClick={handleSwapStations}
                            disabled={!canSwap || isPending}
                            className="p-2 bg-white border border-gray-300 rounded-full shadow-sm text-gray-600 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                            aria-label="発駅と着駅を入れ替える"
                            title="駅を入れ替える"
                        >
                            <RiArrowUpDownLine className="text-xl" />
                        </button>
                    </div>

                    <div className="flex flex-col w-full">
                        <div className="flex items-center gap-5 w-full">
                            <p className="w-12 shrink-0 whitespace-nowrap">着駅</p>
                            <div className="flex-1 w-full min-w-0">
                                <Controller
                                    name="endStation"
                                    control={control}
                                    rules={{ validate: (v) => validateStation(v, "endStation") }}
                                    render={({ field }) => (
                                        <SelectStation
                                            instanceId="end-station-split"
                                            {...field}
                                            options={stationDatas}
                                        />
                                    )}
                                />
                            </div>
                        </div>
                        <div className="min-h-[24px] mt-1 ml-17">
                            {errors.endStation && (
                                <p className="text-red-500 text-xs">
                                    {errors.endStation.message}
                                </p>
                            )}
                        </div>
                    </div>

                    <div className="mt-2 w-full">
                        <button
                            type="submit"
                            className="w-full px-6 py-3 bg-blue-500 text-white rounded disabled:bg-gray-400 hover:bg-blue-600 transition-colors cursor-pointer disabled:cursor-not-allowed"
                            disabled={!isValid || isCalculating || (currentType !== "ticket" && !isWasmReady)}
                        >
                            {isCalculating 
                                ? "計算中..." 
                                : (currentType !== "ticket" && !isWasmReady) 
                                    ? "計算エンジン初期化中..." 
                                    : `${isIcPass ? "IC" : ""}${SEARCH_TYPE_OPTIONS.find(o => o.value === currentType)?.label || "運賃"}を計算`
                            }
                        </button>
                    </div>
                </div>
            </form>

            <div className="my-8">
                {isCalculating && <p className="py-5 border-t text-center text-gray-500">計算中です...</p>}
                {!isCalculating && serverTime != null && <p className="text-right text-xs text-gray-400">計算時間: {serverTime}ms</p>}
                {!isCalculating && error && <p className="py-5 border-t text-red-500 text-center">{error}</p>}

                {!isCalculating && result && (
                    <div className="border-t pt-8 space-y-8">
                        <h2 className="text-2xl font-bold text-center mb-6">計算結果</h2>

                        <section className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
                            <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">分割前の{searchedTypeLabel}</h3>
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-lg font-bold">
                                        <span>{result.cheapestKippuData.departureStation}</span>
                                        <span className="text-gray-400 mx-2">{searchedTypeLabel === "普通乗車券" ? "→" : "↔"}</span>
                                        <span>{result.cheapestKippuData.arrivalStation}</span>
                                        {result.cheapestKippuData.totalEigyoKilo > 0 && (
                                            <span className="text-sm font-normal text-gray-600 ml-1">
                                                （{(result.cheapestKippuData.totalEigyoKilo / 10).toFixed(1)}km）
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        経由：{result.cheapestKippuData.printedViaLines.join("・") || "---"}
                                    </div>
                                </div>
                                <div className="text-3xl font-bold text-gray-800">
                                    ¥{result.cheapestKippuData.fare.toLocaleString()}
                                </div>
                            </div>
                        </section>

                        {result.splitKippuDatasList.length > 0 ? (
                            <div className="space-y-6">
                                {(() => {
                                    const bestFare = result.splitKippuDatasList[0].totalFare;
                                    const diff = result.cheapestKippuData.fare - bestFare;
                                    const isCheaper = diff > 0;

                                    return (
                                        <section className={`p-6 rounded-lg shadow-md border-2 ${isCheaper ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}`}>
                                            <div className="flex justify-between items-center">
                                                <div>
                                                    <h3 className="font-bold text-xl text-blue-800">
                                                        最安分割運賃
                                                    </h3>
                                                    {isCheaper ? (
                                                        <p className="text-red-600 font-bold mt-1 text-lg">
                                                            {diff.toLocaleString()}円安くなりました！
                                                        </p>
                                                    ) : (
                                                        <p className="text-gray-500 text-sm mt-1">通常運賃と同じ</p>
                                                    )}
                                                </div>
                                                <div className="text-4xl font-bold text-blue-900">
                                                    ¥{bestFare.toLocaleString()}
                                                </div>
                                            </div>
                                        </section>
                                    );
                                })()}

                                <div className="space-y-6">
                                    {result.splitKippuDatasList.map((splitPlan, planIndex) => {
                                        if (!showAllPatterns && planIndex > 1) return null;

                                        const isFadedItem = !showAllPatterns && planIndex === 1;

                                        return (
                                            <div
                                                key={planIndex}
                                                className={`bg-gray-50 rounded-lg border border-gray-200 relative transition-all duration-300 ${isFadedItem ? "h-32 overflow-hidden" : "p-4"
                                                    }`}
                                            >
                                                <div className={isFadedItem ? "p-4" : ""}>
                                                    {result.splitKippuDatasList.length > 1 && (
                                                        <h4 className="font-bold text-gray-700 mb-3 ml-1">
                                                            パターン {planIndex + 1}
                                                        </h4>
                                                    )}

                                                    <div className="flex flex-col gap-3">
                                                        {splitPlan.splitKippuDatas.map((segment, segIndex) => (
                                                            <div key={segIndex} className="bg-white p-4 rounded border border-gray-200 shadow-sm relative">
                                                                <div className="text-sm text-gray-500 mb-1 flex items-center">
                                                                    <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs mr-2">利用区間</span>
                                                                    <span>{segment.departureStation} {searchedTypeLabel === "普通乗車券" ? "→" : "↔"} {segment.arrivalStation}</span>
                                                                </div>

                                                                <div className="flex justify-between items-center mt-2">
                                                                    <div className="flex-1">
                                                                        <div className="text-lg font-bold text-gray-800 flex items-center flex-wrap gap-2">
                                                                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">切符</span>
                                                                            <span>{segment.kippuData.departureStation}</span>
                                                                            <span className="text-gray-400">{searchedTypeLabel === "普通乗車券" ? "→" : "↔"}</span>
                                                                            <span>{segment.kippuData.arrivalStation}</span>
                                                                            {segment.kippuData.totalEigyoKilo > 0 && (
                                                                                <span className="text-sm font-normal text-gray-600 ml-1">
                                                                                    （{(segment.kippuData.totalEigyoKilo / 10).toFixed(1)}km）
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="text-xs text-gray-500 mt-1 ml-10">
                                                                            経由：{segment.kippuData.printedViaLines.length === 0 ? "---" : segment.kippuData.printedViaLines.join("・")}
                                                                        </div>
                                                                    </div>
                                                                    <div className="font-bold text-xl ml-4">
                                                                        ¥{segment.kippuData.fare.toLocaleString()}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>

                                                {isFadedItem && (
                                                    <button
                                                        type="button"
                                                        className="absolute inset-x-0 bottom-0 h-24 flex items-end justify-center pb-3 bg-linear-to-t from-gray-50 via-gray-50/80 to-transparent cursor-pointer group w-full"
                                                        onClick={() => setShowAllPatterns(true)}
                                                        title="残りのパターンを展開する"
                                                        aria-label="残りのパターンを展開する"
                                                    >
                                                        <div className="bg-white border border-gray-200 shadow-sm p-2 rounded-full text-blue-500 group-hover:bg-blue-50 group-hover:border-blue-300 transition-all flex items-center justify-center">
                                                            <HiChevronDown className="text-2xl" />
                                                        </div>
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}

                                    {showAllPatterns && result.splitKippuDatasList.length > 1 && (
                                        <div className="flex justify-center mt-8 pb-4">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowAllPatterns(false);
                                                }}
                                                className="px-5 py-2.5 bg-white border border-gray-300 text-gray-600 font-medium rounded-full hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2 text-sm"
                                            >
                                                <HiChevronUp className="text-lg" />
                                                追加のパターンを閉じる
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <p className="text-center text-gray-500">有効な分割候補が見つかりませんでした。</p>
                        )}
                    </div>
                )}
            </div>
            <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
                <h3 className="font-bold text-gray-600 mb-2">💡 当システムについて</h3>
                <p className="mb-4 leading-relaxed">
                    出発駅と到着駅を入力するだけで、分割乗車券の最安解を自動計算するツールです。経路は自動探索します。普通乗車券と定期乗車券の両方に対応しています。
                </p>

                <h3 className="font-bold text-gray-600 mb-2">ご利用手順</h3>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li><strong>種類の選択:</strong> 「普通乗車券」と「定期乗車券(1/3/6箇月)」のいずれかを選択してください。</li>
                    <li><strong>駅の入力:</strong> 「発駅」と「着駅」に駅名を入力し、候補から選択します。</li>
                    <li><strong>駅の入れ替え:</strong> 検索フォームの入力を逆にしたい場合は ⇅ ボタンを押すことで切り替わります。</li>
                    <li><strong>最安分割運賃の計算:</strong> 計算ボタンを押すと、自動で最安分割運賃と切符の情報が出力されます。</li>
                </ol>
            </div>
        </main >
    );
}
