"use client";

import { useForm, Controller, SubmitHandler, useFieldArray, useWatch } from "react-hook-form";
import type { SingleValue } from "react-select";
import { useState, useRef, useEffect } from "react";
import { RiArrowUpDownLine } from "react-icons/ri";

import stationData from "@/app/mr/data/stations.json";
import lineData from "@/app/mr/data/lines.json";
import SelectStation from "@/app/mr/components/SelectStation";
import SelectLine from "@/app/mr/components/SelectLine";

import { Station, Line, KippuData, IFormInput, PathStep, CalculationMode } from "@/app/types";

const stationMap = new Map(stationData.map(s => [s.name, s]));
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
interface FormValues extends IFormInput {
    calculationMode: CalculationMode;
    searchType: "ticket" | "pass1" | "pass3" | "pass6";
}

export default function Form() {
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

    const currentType = formValues.searchType;
    const isPeriodDisabled = currentType === "ticket";

    // クライアント側での経路展開 (重複チェック用)
    const getClientFullPath = (start: Station | null, segments: typeof formValues.segments): string[] => {
        if (!start) return [];
        const fullPath: string[] = [start.name];

        for (let i = 0; i < segments.length; i++) {
            const segment = segments[i];
            const prevStationName = fullPath[fullPath.length - 1];
            const destStation = segment.destinationStation;
            const line = segment.viaLine;

            if (!destStation || !line) {
                break;
            }

            const matchLine = lineData.find(l => l.name === line.name);
            if (!matchLine) {
                break;
            }

            const stationsOnLine = matchLine.stations;
            const startIdx = stationsOnLine.indexOf(prevStationName);
            const endIdx = stationsOnLine.indexOf(destStation.name);

            if (startIdx === -1 || endIdx === -1) {
                fullPath.push(destStation.name);
                continue;
            }

            let segmentStations: string[];
            if (startIdx < endIdx) {
                segmentStations = stationsOnLine.slice(startIdx + 1, endIdx + 1);
            } else {
                segmentStations = stationsOnLine.slice(endIdx, startIdx).reverse();
            }

            fullPath.push(...segmentStations);
        }
        return fullPath;
    };

    // リアルタイムバリデーション: 重複経路チェック (最後の一駅を除く)
    const clientFullPath = getClientFullPath(formValues.startStation, formValues.segments || []);
    const firstPart = clientFullPath.slice(0, -1);
    const isDuplicateRoute = firstPart.some((name, index) => firstPart.indexOf(name) !== index);

    const handleTabChange = (tab: "ticket" | "pass") => {
        setResult(null);
        setResultPass(null);
        setCorrectedStartPass("");
        setCorrectedEndPass("");
        setError(null);
        setServerTime(null);

        const nextSearchType = tab === "ticket" ? "ticket" : "pass6";
        setValue("searchType", nextSearchType, { shouldValidate: true });

        // 即時バリデーション
        setTimeout(() => {
            if (!getValues("startStation")) return;
            const fieldsCount = getValues("segments").length;
            const fieldsToTrigger = ["startStation"];
            if (fieldsCount > 0) {
                fieldsToTrigger.push(`segments.${fieldsCount - 1}.destinationStation`);
            }
            trigger(fieldsToTrigger as Parameters<typeof trigger>[0]);
        }, 0);
    };

    const handlePeriodChange = (period: "pass1" | "pass3" | "pass6") => {
        setResult(null);
        setResultPass(null);
        setCorrectedStartPass("");
        setCorrectedEndPass("");
        setError(null);
        setServerTime(null);

        setValue("searchType", period, { shouldValidate: true });

        // 即時バリデーション
        setTimeout(() => {
            if (!getValues("startStation")) return;
            const fieldsCount = getValues("segments").length;
            const fieldsToTrigger = ["startStation"];
            if (fieldsCount > 0) {
                fieldsToTrigger.push(`segments.${fieldsCount - 1}.destinationStation`);
            }
            trigger(fieldsToTrigger as Parameters<typeof trigger>[0]);
        }, 0);
    };

    const lastSegment = formValues.segments?.[formValues.segments?.length - 1];
    const lastDestination = lastSegment?.destinationStation;

    const isUnderPathLimit = (formValues.segments?.length ?? 0) < 3000;

    const canAddTransfer = (lastDestination ? (lastDestination.lines?.length ?? 0) > 1 : false) && isUnderPathLimit;

    const canReverse = !!formValues.startStation &&
        (formValues.segments?.length ?? 0) > 0 &&
        formValues.segments.every((seg: { viaLine: Line | null, destinationStation: Station | null }) => seg.viaLine && seg.destinationStation);

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

    // フォームの入力値のみを逆転させる処理（計算やResultの操作は行わない）
    const handleReverseRoute = () => {
        if (!canReverse) return;

        const currentStart = getValues("startStation");
        const currentSegments = getValues("segments");

        if (!currentStart) return;

        const reversedSegments = [];
        const newStart = currentSegments[currentSegments.length - 1].destinationStation;

        for (let i = currentSegments.length - 1; i >= 0; i--) {
            const dest = i === 0 ? currentStart : currentSegments[i - 1].destinationStation;
            const line = currentSegments[i].viaLine;
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

        return {
            path,
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

        const apiRequestBody = createApiRequestBody(data);

        if (!apiRequestBody) {
            setError("経路が不完全です。");
            setIsLoading(false);
            return;
        }

        let stations = new Set<string>();
        for (let i = 0; i < apiRequestBody.path.length; i++) {
            stations.add(apiRequestBody.path[i].stationName);
        }
        if (!apiRequestBody || apiRequestBody.path.length < 2 || stations.size === 1) {
            setError('不正な経路です');
            setIsLoading(false);
            return;
        }

        try {
            const response = await fetch('/api/mr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiRequestBody),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || "サーバーエラーが発生しました。");
            }

            const responseData = await response.json();
            if (responseData.data && "correctedPath" in responseData.data) {
                if (!workerRef.current || !isWasmReady) {
                    throw new Error("計算エンジン (Web Worker) が初期化されていません。しばらく待ってから再度お試しください。");
                }
                const monthsMap: Record<string, number> = { pass1: 1, pass3: 3, pass6: 6 };
                const months = monthsMap[data.searchType] || 1;

                const cPath: string[] = responseData.data.correctedPath;

                workerRef.current.postMessage({
                    type: "calculateRoutePass",
                    payload: {
                        stationNames: cPath,
                        calculationMode: data.calculationMode,
                        months,
                        isIc: false
                    }
                });
                setServerTime(responseData.time);
            } else if (responseData.data) {
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
                            : formValues.segments[index - 1].destinationStation;

                        const previousLine = index > 0 ? formValues.segments[index - 1]?.viaLine : null;

                        const availableLineNames = new Set(previousStation?.lines || []);

                        const availableLines = previousStation
                            ? lineData
                                .filter(line => availableLineNames.has(line.name))
                                .filter(line => !previousLine || line.name !== previousLine.name)
                            : [];

                        const selectedLine = formValues.segments[index]?.viaLine;

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

                    {/* 経路追加 ＆ 経路逆転 ボタン群 */}
                    <div className="flex items-center flex-wrap gap-3 my-2 w-full">
                        <button
                            type="button"
                            onClick={addSegment}
                            disabled={!canAddTransfer || isDuplicateRoute}
                            className="px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600 disabled:bg-slate-300 transition-colors shadow-sm whitespace-nowrap"
                            title={!isUnderPathLimit ? "経路数の上限（3000件）に達しました" : "前の駅で乗り換え可能な路線がある場合に追加できます"}
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
                                    {...register("calculationMode")}
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
                                    {...register("calculationMode")}
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
                                    {...register("calculationMode")}
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
                        disabled={!isValid || isDuplicateRoute || isLoading || (currentType !== "ticket" && !isWasmReady)}
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
