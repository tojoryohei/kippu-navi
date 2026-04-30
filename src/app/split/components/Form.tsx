"use client";

import { useState } from "react";
import { useForm, Controller, SubmitHandler } from "react-hook-form";
import { RiArrowUpDownLine } from "react-icons/ri";

import stationData from "@/app/split/data/stations.json";
import SelectStation from "@/app/split/components/SelectStation";
import { ApiSplitFullResponse, SplitApiRequest, SplitApiResponse, SplitFormInput, Station } from "@/app/types";

export default function SplitForm() {
    const { handleSubmit, control, formState: { isValid, errors }, getValues, setValue, watch } = useForm<SplitFormInput>({
        mode: 'onChange',
        defaultValues: {
            startStation: null,
            endStation: null,
        },
    });

    const [result, setResult] = useState<SplitApiResponse | null>(null);
    const [serverTime, setServerTime] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 発駅と着駅の現在の値を監視し、どちらかが入力されているか判定
    const startStationVal = watch("startStation");
    const endStationVal = watch("endStation");
    const canSwap = !!startStationVal || !!endStationVal;

    // 駅を入れ替える関数
    const handleSwapStations = () => {
        const currentStart = getValues("startStation");
        const currentEnd = getValues("endStation");
        setValue("startStation", currentEnd, { shouldValidate: true });
        setValue("endStation", currentStart, { shouldValidate: true });
    };

    const validateStation = (value: Station | null) => {
        if (!value || !value.name) return "駅名を入力してください";
        const exists = stationData.some((s: any) => s.name === value.name);
        return exists || "正しい駅名を選択または入力してください";
    };

    const onSubmit: SubmitHandler<SplitFormInput> = async (data) => {
        setIsLoading(true);
        setError(null);
        setResult(null);
        setServerTime(null);
        const apiRequestBody: SplitApiRequest = {
            startStationName: data.startStation!.name,
            endStationName: data.endStation!.name,
        };

        try {
            const response = await fetch('/api/split', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiRequestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "サーバーでエラーが発生しました。");
            }

            const responseData: ApiSplitFullResponse = await response.json();
            if (responseData.data && typeof responseData.time === "number") {
                setResult(responseData.data);
                setServerTime(responseData.time);
            } else {
                throw new Error("サーバーからのレスポンス形式が不正です。");
            }
        } catch (err: any) {
            setError(err.message || "計算に失敗しました。");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <main className="max-w-2xl mx-auto w-full">
            <form onSubmit={handleSubmit(onSubmit)} className="p-8 w-full">
                {/* フォーム全体を w-full にして幅を統一 */}
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
                                            options={stationData}
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
                            disabled={!canSwap}
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
                                            options={stationData}
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
                            disabled={!isValid || isLoading}
                        >
                            {isLoading ? "計算中..." : "最安分割運賃を計算"}
                        </button>
                    </div>
                </div>
            </form>

            <div className="my-8 p-4">
                {isLoading && <p className="py-5 border-t text-center text-gray-500">計算中です...</p>}
                {serverTime && <p className="text-right text-xs text-gray-400">計算時間: {serverTime}ms</p>}

                {error && <p className="py-5 border-t text-red-500 text-center">{error}</p>}

                {result && (
                    <div className="border-t pt-8 space-y-8">
                        <h2 className="text-2xl font-bold text-center mb-6">計算結果</h2>

                        <section className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
                            <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">通常の運賃（分割なし）</h3>
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-lg font-bold">
                                        <span>{result.shortestData.departureStation}</span>
                                        <span className="text-gray-400 mx-2">→</span>
                                        <span>{result.shortestData.arrivalStation}</span>
                                        <span className="text-sm font-normal text-gray-600 ml-1">
                                            （{(result.shortestData.totalEigyoKilo / 10).toFixed(1)}km）
                                        </span>
                                    </div>
                                    <div className="text-sm text-gray-600 mt-1">
                                        経由：{result.shortestData.printedViaLines.join('・') || '---'}
                                    </div>
                                </div>
                                <div className="text-3xl font-bold text-gray-800">
                                    ¥{result.shortestData.fare.toLocaleString()}
                                </div>
                            </div>
                        </section>

                        {result.splitKippuDatasList.length > 0 ? (
                            <div className="space-y-6">
                                {(() => {
                                    const bestFare = result.splitKippuDatasList[0].totalFare;
                                    const diff = result.shortestData.fare - bestFare;
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

                                <div className="space-y-8">
                                    {result.splitKippuDatasList.map((splitPlan, planIndex) => (
                                        <div key={planIndex} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
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
                                    ))}
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
                    出発駅と到着駅を入力するだけで、分割乗車券の最安解を自動計算するツールです。経路は自動探索します。
                </p>

                <h3 className="font-bold text-gray-600 mb-2">ご利用手順</h3>
                <ol className="list-decimal list-inside space-y-1 ml-1">
                    <li><strong>駅の入力:</strong> 「発駅」と「着駅」に駅名を入力し、候補から選択します。</li>
                    <li><strong>駅の入れ替え:</strong> 検索フォームの入力を逆にしたい場合は ⇅ ボタンを押すことで切り替わります。</li>
                    <li><strong>最安分割運賃の計算:</strong> 「最安分割運賃を計算」ボタンを押すと、自動で最安分割運賃と切符の情報が出力されます。</li>
                </ol>
            </div>
        </main>
    );
}