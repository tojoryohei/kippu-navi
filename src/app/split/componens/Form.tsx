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
        <main className="max-w-md mx-auto">
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
                            className="w-full px-6 py-3 bg-blue-500 text-white rounded disabled:bg-gray-400"
                            disabled={!isValid || isLoading}
                        >
                            {isLoading ? "計算中..." : "最安運賃を計算"}
                        </button>
                    </div>
                </div>
            </form>

            <div className="my-8 p-4">
                {isLoading && <p className="py-5 border-t text-center">計算中です...</p>}
                {serverTime && <p>計算時間(ms): {serverTime}</p>}

                {error && <p className="py-5 border-t text-red-500 text-center">{error}</p>}
                {result && (
                    <div className="border-t pt-4">
                        <h2 className="text-2xl font-bold text-center">計算結果</h2>
                        <div className="text-center my-4 p-4 bg-gray-100 rounded">
                            <span className="text-lg">最安運賃（総額）</span>
                            <span className="text-4xl font-bold mx-2">
                                ¥{result.totalFare.toLocaleString()}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-bold mb-2">分割切符の詳細</h3>
                            <div className="flex flex-col gap-2">
                                {result.segments.map((segment, index) => (
                                    <div key={index} className="border p-3 rounded-lg shadow-sm">
                                        <div className="font-bold text-lg mb-2">
                                            <span>{segment.departureStation}</span>
                                            <span className="mx-2">→</span>
                                            <span>{segment.arrivalStation}</span>
                                        </div>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-600">
                                                経由：{segment.printedViaLines.length === 0 ? "ーーー" : segment.printedViaLines.join("・")}
                                            </span>
                                            <span className="font-bold text-lg">
                                                ¥{segment.fare.toLocaleString()}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </main>
    );
}