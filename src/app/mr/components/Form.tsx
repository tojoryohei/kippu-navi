"use client";

import { useForm, Controller, SubmitHandler, useFieldArray } from "react-hook-form";
import type { SingleValue } from "react-select";
import { useState } from "react";
import { RiArrowUpDownLine } from "react-icons/ri";

import stationData from "@/app/mr/data/stations.json";
import lineData from "@/app/mr/data/lines.json";
import SelectStation from "@/app/mr/components/SelectStation";
import SelectLine from "@/app/mr/components/SelectLine";

import { Station, Line, KippuData, ApiFullResponse, IFormInput, PathStep, CalculationMode } from "@/app/types";

const stationMap = new Map(stationData.map(s => [s.name, s]));

interface FormValues extends IFormInput {
    calculationMode: CalculationMode;
}

export default function Form() {
    const { register, handleSubmit, control, watch, setValue, getValues, formState: { isValid } } = useForm<FormValues>({
        mode: 'onChange',
        defaultValues: {
            startStation: null,
            segments: [{ viaLine: null, destinationStation: null }],
            calculationMode: "normal",
        },
    });

    const { fields, append, replace } = useFieldArray({ control, name: "segments" });
    const formValues = watch();

    const lastSegment = formValues.segments[formValues.segments.length - 1];
    const lastDestination = lastSegment?.destinationStation;

    const isUnderPathLimit = formValues.segments.length < 99;

    const canAddTransfer = (lastDestination ? (lastDestination.lines?.length ?? 0) > 1 : false) && isUnderPathLimit;

    const canReverse = !!formValues.startStation &&
        formValues.segments.length > 0 &&
        formValues.segments.every(seg => seg.viaLine && seg.destinationStation);

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
            calculationMode: data.calculationMode
        };
    };

    const [result, setResult] = useState<KippuData | null>(null);
    const [serverTime, setServerTime] = useState<number | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const onSubmit: SubmitHandler<FormValues> = async (data) => {
        setIsLoading(true);
        setError(null);
        setResult(null);
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
                const errorData = await response.json();
                throw new Error(errorData.error);
            }

            const responseData: ApiFullResponse = await response.json();
            if (responseData.data && typeof responseData.time === "number") {
                setResult(responseData.data);
                setServerTime(responseData.time);
            } else {
                throw new Error("サーバーからのレスポンス形式が不正です。");
            }

        } catch (err) {
            if (err instanceof Error) {
                setError(err.message)
            } else {
                setError("計算に失敗しました。");
            }
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <>
            <form onSubmit={handleSubmit(onSubmit)} className="p-8 w-full">
                <div className="flex flex-col gap-4 w-full">

                    {/* 発駅 */}
                    <div className="flex items-center gap-5 w-full whitespace-nowrap">
                        <p className="w-12 shrink-0">発駅</p>
                        <Controller
                            name="startStation"
                            control={control}
                            rules={{
                                required: "発駅を入力してください",
                                validate: (selected) => {
                                    if (!selected) return "発駅を入力してください";
                                    const exists = stationData.some(s => s.name === selected.name);
                                    return exists || "該当する駅が存在しません";
                                }
                            }}
                            render={({ field, fieldState }) => (
                                <div className="flex-1 min-w-0">
                                    <SelectStation
                                        instanceId="start-station"
                                        value={field.value}
                                        onChange={(value) => handleFieldChange(value, field.onChange, resetOnStartStationChange)}
                                        hideMenuWhenEmpty={true}
                                    />
                                    {fieldState.error && <p className="text-red-500 text-xs mt-1">{fieldState.error.message}</p>}
                                </div>
                            )}
                        />
                    </div>

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
                                <div className="flex items-center gap-5 w-full whitespace-nowrap">
                                    <p className="w-12 shrink-0">{stationLabel}</p>
                                    <Controller
                                        name={`segments.${index}.destinationStation`}
                                        control={control}
                                        rules={{
                                            required: `${stationLabel}を入力してください`,
                                            validate: (selected) => {
                                                if (!selected) return `${stationLabel}を入力してください`;
                                                const exists = stationsOnLine.some(s => s.name === selected.name);
                                                return exists || "選択された路線にこの駅は存在しません";
                                            }
                                        }}
                                        render={({ field, fieldState }) => (
                                            <div className="flex-1 min-w-0">
                                                <SelectStation
                                                    instanceId={`dest-station-${index}`}
                                                    options={stationsOnLine}
                                                    isDisabled={!selectedLine}
                                                    value={field.value}
                                                    onChange={(value) => handleFieldChange(value, field.onChange, () => resetOnDestinationStationChange(index))}
                                                />
                                                {fieldState.error && <p className="text-red-500 text-xs mt-1">{fieldState.error.message}</p>}
                                            </div>
                                        )}
                                    />
                                </div>
                            </div>
                        );
                    })}

                    {/* 経路追加 ＆ 経路逆転 ボタン群 */}
                    <div className="flex items-center flex-wrap gap-3 my-2 w-full">
                        <button
                            type="button"
                            onClick={addSegment}
                            disabled={!canAddTransfer}
                            className="px-4 py-2 bg-slate-500 text-white rounded hover:bg-slate-600 disabled:bg-slate-300 transition-colors shadow-sm whitespace-nowrap"
                            title={!isUnderPathLimit ? "経路数の上限（99件）に達しました" : "前の駅で乗り換え可能な路線がある場合に追加できます"}
                        >
                            経由路線を追加
                        </button>
                        <button
                            type="button"
                            onClick={handleReverseRoute}
                            disabled={!canReverse}
                            className="px-4 py-2 bg-white text-slate-700 border border-slate-300 rounded hover:bg-slate-50 disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 flex items-center gap-2 transition-colors shadow-sm whitespace-nowrap"
                            title="入力フォームの発着駅と経路を逆転させます"
                        >
                            <RiArrowUpDownLine className="w-5 h-5" />
                            経路を逆転
                        </button>
                    </div>

                    {/* 運賃計算モード選択（ラジオボタン） */}
                    <div className="my-4 flex flex-col items-start bg-slate-50 p-4 rounded-md border border-slate-200 w-full">
                        <p className="block text-base font-bold text-slate-700 mb-3">
                            運賃計算モード
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

                    <button type="submit" className="w-full px-6 py-3 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400 disabled:text-white transition-colors mt-2" disabled={!isValid}>
                        運賃計算をする
                    </button>
                </div>
            </form>

            <div className="my-8 p-4">
                {isLoading && <p className="py-5 border-t">計算中...</p>}
                {serverTime && <p className="text-right text-xs text-gray-400">計算時間: {serverTime}ms</p>}

                {error && <p className="py-5 border-t text-red-500">{error}</p>}

                {result && (
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
                            <span>{/* result.validDays + " 日間有効" */}</span>
                            <span className="text-xl">¥{result.fare > 0 ? result.fare.toLocaleString() : "***"}</span>
                        </span>
                    </div>
                )}
            </div>
            <div className="mt-8 pt-6 border-t border-gray-200 text-sm text-gray-500">
                <h3 className="font-bold text-gray-600 mb-2">💡 当システムについて</h3>
                <p className="mb-4 leading-relaxed">
                    出発駅と到着駅、および経由する路線を入力するだけで、JRの正しい乗車券運賃を自動計算するツールです。
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
