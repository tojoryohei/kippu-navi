"use client";

import { useState } from "react";
import { useForm, Controller, SubmitHandler } from "react-hook-form";

import stationData from "@/app/split/data/stations.json";
import SelectStation from "@/app/split/componens/SelectStation";
import { ApiSplitFullResponse, SplitApiRequest, SplitApiResponse, SplitFormInput } from "@/app/types";

export default function SplitForm() {
    const { handleSubmit, control, formState: { isValid } } = useForm<SplitFormInput>({
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
        <main className="max-w-2xl mx-auto">
            <form onSubmit={handleSubmit(onSubmit)} className="p-8">
                <div className="flex flex-col gap-4">
                    <div className="flex items-center gap-5 whitespace-nowrap">
                        <p className="w-12">発駅</p>
                        <Controller
                            name="startStation"
                            control={control}
                            rules={{ required: true }}
                            render={({ field }) => (
                                <SelectStation
                                    instanceId="start-station-split"
                                    {...field}
                                    options={stationData}
                                />
                            )}
                        />
                    </div>
                    <div className="flex items-center gap-5 whitespace-nowrap">
                        <p className="w-12">着駅</p>
                        <Controller
                            name="endStation"
                            control={control}
                            rules={{ required: true }}
                            render={({ field }) => (
                                <SelectStation
                                    instanceId="end-station-split"
                                    {...field}
                                    options={stationData}
                                />
                            )}
                        />
                    </div>
                    <div>
                        <button
                            type="submit"
                            className="w-full px-6 py-3 bg-blue-500 text-white rounded disabled:bg-gray-400 hover:bg-blue-600 transition-colors"
                            disabled={!isValid || isLoading}
                        >
                            {isLoading ? "計算中..." : "最安運賃を計算"}
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

                        {/* 1. 通し運賃の表示 */}
                        <section className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
                            <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">通常の運賃（分割なし）</h3>
                            <div className="flex justify-between items-center">
                                <div>
                                    <div className="text-lg font-bold">
                                        {result.shortestData.departureStation} <span className="text-gray-400 mx-2">→</span> {result.shortestData.arrivalStation}
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

                        {/* 2. 分割結果の表示エリア */}
                        {result.splitKippuDatasList.length > 0 ? (
                            <div className="space-y-6">
                                {/* ★変更点: 分割運賃のサマリー（金額とお得額）をここで一回だけ表示する 
                                    全ての分割プランは同じ最安値を持っている前提
                                */}
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

                                {/* 3. 実際の分割パターンのリスト表示 */}
                                <div className="space-y-8">
                                    {result.splitKippuDatasList.map((splitPlan, planIndex) => (
                                        <div key={planIndex} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                            {/* 複数パターンがある場合のみ見出しをつける */}
                                            {result.splitKippuDatasList.length > 1 && (
                                                <h4 className="font-bold text-gray-700 mb-3 ml-1">
                                                    パターン {planIndex + 1}
                                                </h4>
                                            )}

                                            <div className="flex flex-col gap-3">
                                                {splitPlan.splitKippuDatas.map((segment, segIndex) => (
                                                    <div key={segIndex} className="bg-white p-4 rounded border border-gray-200 shadow-sm relative">
                                                        {/* 実際の乗車区間 */}
                                                        <div className="text-sm text-gray-500 mb-1 flex items-center">
                                                            <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs mr-2">利用区間</span>
                                                            <span>{segment.departureStation} → {segment.arrivalStation}</span>
                                                        </div>

                                                        {/* 切符の区間 (2行目) */}
                                                        <div className="flex justify-between items-center mt-2">
                                                            <div className="flex-1">
                                                                <div className="text-lg font-bold text-gray-800 flex items-center flex-wrap gap-2">
                                                                    <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">切符</span>
                                                                    <span>{segment.kippuData.departureStation}</span>
                                                                    <span className="text-gray-400">→</span>
                                                                    <span>{segment.kippuData.arrivalStation}</span>

                                                                    {/* ★追加: 営業キロの表示 */}
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
        </main>
    );
}