"use client";

import { useState, useTransition, useEffect } from "react";
import { useForm, Controller, SubmitHandler, useWatch } from "react-hook-form";
import { RiArrowUpDownLine } from "react-icons/ri";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import { useRouter } from "next/navigation";
import { sendGAEvent } from '@next/third-parties/google';

import stationDatas from "@/app/split/data/stationDatas.json";
import SelectStation from "@/app/split/components/SelectStation";
import { SearchOption, SearchType, SplitApiResponse, Station } from "@/app/types";

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
    { value: "pass1", label: "通勤１箇月" },
    { value: "pass3", label: "通勤３箇月" },
    { value: "pass6", label: "通勤６箇月" },
];

export const TEMPORARY_STATIONS = [
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

export default function SplitForm({
    initialFrom,
    initialTo,
    initialSearchType,
    result: initialResult,
    error: initialError,
    serverTime: initialServerTime,
}: SplitFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    const initialStartStation = initialFrom ? stationDatas.find(s => s.name === initialFrom) || { name: initialFrom, kana: "" } : null;
    const initialEndStation = initialTo ? stationDatas.find(s => s.name === initialTo) || { name: initialTo, kana: "" } : null;

    const defaultSearchType = (initialSearchType === 'pass1' || initialSearchType === 'pass3' || initialSearchType === 'pass6')
        ? initialSearchType
        : 'ticket';

    const { handleSubmit, control, formState: { isValid, errors }, getValues, setValue, reset, trigger } = useForm<ExtendedSplitFormInput>({
        mode: 'onChange',
        defaultValues: {
            startStation: initialStartStation,
            endStation: initialEndStation,
            searchType: defaultSearchType,
        },
    });

    useEffect(() => {
        const startStation = initialFrom ? stationDatas.find(s => s.name === initialFrom) || { name: initialFrom, kana: "" } : null;
        const endStation = initialTo ? stationDatas.find(s => s.name === initialTo) || { name: initialTo, kana: "" } : null;
        const currentSearchType = (initialSearchType === 'pass1' || initialSearchType === 'pass3' || initialSearchType === 'pass6')
            ? initialSearchType
            : 'ticket';

        reset({
            startStation,
            endStation,
            searchType: currentSearchType,
        });
    }, [initialFrom, initialTo, initialSearchType, reset]);

    const [showAllPatterns, setShowAllPatterns] = useState(false);

    const startStationVal = useWatch({ control, name: "startStation" });
    const endStationVal = useWatch({ control, name: "endStation" });
    const currentType = useWatch({ control, name: "searchType" });

    const canSwap = !!startStationVal || !!endStationVal;

    const handleSwapStations = () => {
        const currentStart = getValues("startStation");
        const currentEnd = getValues("endStation");
        setValue("startStation", currentEnd, { shouldValidate: true });
        setValue("endStation", currentStart, { shouldValidate: true });
    };

    const stations = new Set((stationDatas as Station[]).map((s) => s.name))

    const validateStation = (value: Station | null) => {
        if (!value || !value.name) return "駅名を入力してください";
        const exists = stations.has(value.name);
        if (!exists) return "正しい駅名を選択または入力してください";
        const currentSearchType = getValues("searchType");
        if (currentSearchType !== 'ticket' && TEMPORARY_STATIONS.includes(value.name)) {
            return "臨時駅発着の定期券は計算できません";
        }

        return true;
    };

    const onSubmit: SubmitHandler<ExtendedSplitFormInput> = (data) => {
        setShowAllPatterns(false);

        if (data.startStation?.name && data.endStation?.name) {
            sendGAEvent({
                event: 'search_split',
                search_type: data.searchType || 'ticket',
                from_station: data.startStation.name,
                to_station: data.endStation.name
            });
        }

        const searchParams = new URLSearchParams();
        if (data.startStation?.name) searchParams.set("from", data.startStation.name);
        if (data.endStation?.name) searchParams.set("to", data.endStation.name);

        if (data.searchType && data.searchType !== 'ticket') {
            searchParams.set("searchType", data.searchType);
        } else {
            searchParams.delete("searchType");
        }

        const newUrl = `?${searchParams.toString()}`;
        window.history.pushState(null, "", newUrl);

        startTransition(() => {
            router.replace(newUrl, { scroll: false });
        });
    };

    return (
        <main className="max-w-2xl mx-auto w-full">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-1.5 p-1 bg-slate-100 rounded-xl mb-6">
                {SEARCH_TYPE_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                            setValue("searchType", option.value, { shouldValidate: true });
                            trigger(["startStation", "endStation"]);
                        }}
                        className={`py-2 px-3 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer text-center ${currentType === option.value
                            ? "bg-white text-blue-600 shadow-xs font-bold"
                            : "text-slate-600 hover:text-slate-900 hover:bg-white/50"
                            }`}
                    >
                        {option.label}
                    </button>
                ))}
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="w-full">
                <div className="flex flex-col gap-4 w-full">

                    <div className="flex flex-col w-full">
                        <div className="flex items-center gap-5 w-full">
                            <p className="w-12 shrink-0 whitespace-nowrap">発駅</p>
                            <div className="flex-1 w-full min-w-0">
                                <Controller
                                    name="startStation"
                                    control={control}
                                    rules={{ validate: validateStation }}
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
                        {errors.startStation && (
                            <p className="text-red-500 text-xs mt-1 ml-17">
                                {errors.startStation.message}
                            </p>
                        )}
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
                                    rules={{ validate: validateStation }}
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
                        {errors.endStation && (
                            <p className="text-red-500 text-xs mt-1 ml-17">
                                {errors.endStation.message}
                            </p>
                        )}
                    </div>

                    <div className="mt-2 w-full">
                        <button
                            type="submit"
                            className="w-full px-6 py-3 bg-blue-500 text-white rounded disabled:bg-gray-400 hover:bg-blue-600 transition-colors"
                            disabled={!isValid || isPending}
                        >
                            {isPending ? "計算中..." : `${SEARCH_TYPE_OPTIONS.find(o => o.value === currentType)?.label || "運賃"}を計算`}
                        </button>
                    </div>
                </div>
            </form>

            <div className="my-8">
                {isPending && <p className="py-5 border-t text-center text-gray-500">計算中です...</p>}
                {!isPending && currentType !== 'ticket' && !initialError && !initialResult && (
                    <p className="py-8 border-t text-center text-slate-400 text-sm">
                        ※ {SEARCH_TYPE_OPTIONS.find(o => o.value === currentType)?.label}の最安分割ルート計算ロジックは次のステップで結合されます。
                    </p>
                )}
                {!isPending && initialServerTime != null && currentType === 'ticket' && <p className="text-right text-xs text-gray-400">計算時間: {initialServerTime}ms</p>}
                {!isPending && initialError && <p className="py-5 border-t text-red-500 text-center">{initialError}</p>}

                {!isPending && initialResult && currentType === 'ticket' && (
                    <div className="border-t pt-8 space-y-8">
                        <h2 className="text-2xl font-bold text-center mb-6">計算結果</h2>

                        <section className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
                            <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">通常の運賃（分割なし）</h3>
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-lg font-bold">
                                        <span>{initialResult.cheapestKippuData.departureStation}</span>
                                        <span className="text-gray-400 mx-2">→</span>
                                        <span>{initialResult.cheapestKippuData.arrivalStation}</span>
                                        <span className="text-sm font-normal text-gray-600 ml-1">
                                            （{(initialResult.cheapestKippuData.totalEigyoKilo / 10).toFixed(1)}km）
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        経由：{initialResult.cheapestKippuData.printedViaLines.join('・') || '---'}
                                    </div>
                                </div>
                                <div className="text-3xl font-bold text-gray-800">
                                    ¥{initialResult.cheapestKippuData.fare.toLocaleString()}
                                </div>
                            </div>
                        </section>

                        {initialResult.splitKippuDatasList.length > 0 ? (
                            <div className="space-y-6">
                                {(() => {
                                    const bestFare = initialResult.splitKippuDatasList[0].totalFare;
                                    const diff = initialResult.cheapestKippuData.fare - bestFare;
                                    const isCheaper = diff > 0;

                                    return (
                                        <section className={`p-6 rounded-lg shadow-md border-2 ${isCheaper ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-white'}`}>
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
                                    {initialResult.splitKippuDatasList.map((splitPlan, planIndex) => {
                                        if (!showAllPatterns && planIndex > 1) return null;

                                        const isFadedItem = !showAllPatterns && planIndex === 1;

                                        return (
                                            <div
                                                key={planIndex}
                                                className={`bg-gray-50 rounded-lg border border-gray-200 relative transition-all duration-300 ${isFadedItem ? 'h-32 overflow-hidden' : 'p-4'
                                                    }`}
                                            >
                                                <div className={isFadedItem ? 'p-4' : ''}>
                                                    {initialResult.splitKippuDatasList.length > 1 && (
                                                        <h4 className="font-bold text-gray-700 mb-3 ml-1">
                                                            パターン {planIndex + 1}
                                                        </h4>
                                                    )}

                                                    <div className="flex flex-col gap-3">
                                                        {splitPlan.splitKippuDatas.map((segment, segIndex) => (
                                                            <div key={segIndex} className="bg-white p-4 rounded border border-gray-200 shadow-sm relative">
                                                                <div className="text-sm text-gray-500 mb-1 flex items-center">
                                                                    <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs mr-2">利用区間</span>
                                                                    <span>{segment.departureStation} → {segment.arrivalStation}</span>
                                                                </div>

                                                                <div className="flex justify-between items-center mt-2">
                                                                    <div className="flex-1">
                                                                        <div className="text-lg font-bold text-gray-800 flex items-center flex-wrap gap-2">
                                                                            <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">切符</span>
                                                                            <span>{segment.kippuData.departureStation}</span>
                                                                            <span className="text-gray-400">→</span>
                                                                            <span>{segment.kippuData.arrivalStation}</span>
                                                                            <span className="text-sm font-normal text-gray-600 ml-1">
                                                                                （{(segment.kippuData.totalEigyoKilo / 10).toFixed(1)}km）
                                                                            </span>
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

                                    {showAllPatterns && initialResult.splitKippuDatasList.length > 1 && (
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
                            !isPending && initialResult && <p className="text-center text-gray-500">有効な分割候補が見つかりませんでした。</p>
                        )}
                    </div>
                )}
            </div>
            <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
                <h3 className="font-bold text-gray-600 mb-2">💡 当システムについて</h3>
                <p className="mb-4 leading-relaxed">
                    出発駅と到着駅を入力するだけで、分割乗車券の最安解を自動計算するツールです。経路は自動探索します。
                </p>

                <h3 className="font-bold text-gray-600 mb-2">ご利用手順</h3>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li><strong>駅の入力:</strong> 「発駅」と「着駅」に駅名を入力し、候補から選択します。</li>
                    <li><strong>駅の入れ替え:</strong> 検索フォームの入力を逆にしたい場合は ⇅ ボタンを押すことで切り替わります。</li>
                    <li><strong>最安分割運賃の計算:</strong> 「最安分割運賃を計算」ボタンを押すと、自動で最安分割運賃と切符の情報が出力されます。</li>
                </ol>
            </div>
        </main >
    );
}
