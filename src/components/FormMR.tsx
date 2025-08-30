"use client";

import { useState } from "react";
import { useForm, Controller, SubmitHandler, useFieldArray } from "react-hook-form";
import type { SingleValue } from "react-select";

import stationData from "@/data/stations.json";
import lineData from "@/data/lines.json";
import SelectStation from "@/components/SelectStation";
import SelectLine from "@/components/SelectLine";

import { Station, Line, ApiResponse, IFormInput, PathStep, RouteRequest } from "@/types";

const stationMap = new Map(stationData.map(s => [s.name, s]));

export default function FormMR() {
    const { handleSubmit, control, watch, setValue, getValues, formState: { isValid } } = useForm<IFormInput>({
        mode: 'onChange',
        defaultValues: {
            startStation: null,
            segments: [{ viaLine: null, destinationStation: null }],
        },
    });

    const { fields, append } = useFieldArray({ control, name: "segments" });
    const formValues = watch();

    const lastSegment = formValues.segments[formValues.segments.length - 1];
    const lastDestination = lastSegment?.destinationStation;
    const canAddTransfer = lastDestination ? lastDestination.lines.length > 1 : false;

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

    const createApiRequestBody = (data: IFormInput): RouteRequest | null => {
        // 出発駅が未選択の場合は処理を中断
        if (!data.startStation) {
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

        return { path };
    };

    const [result, setResult] = useState<ApiResponse | null>(null);

    const [isLoading, setIsLoading] = useState(false);

    const [error, setError] = useState<string | null>(null);

    const onSubmit: SubmitHandler<IFormInput> = async (data) => {
        setIsLoading(true);
        setError(null);
        setResult(null);

        const apiRequestBody = createApiRequestBody(data);

        if (!apiRequestBody) {
            setError("経路が不完全です。");
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
                throw new Error("サーバーでエラーが発生しました。");
            }

            const data: ApiResponse = await response.json();
            setResult(data);

        } catch (err) {
            setError("計算に失敗しました。");
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };
    const isLongDeparture: boolean | null = result && 6 < result.departureStation.length;
    const isLongArrival: boolean | null = result && 6 < result.arrivalStation.length;
    return (
        <main className="max-w-xl mx-auto">
            <h1 className="text-xl font-bold m-4">JR運賃計算（経路入力）</h1>
            <form onSubmit={handleSubmit(onSubmit)} className="p-8">
                <div className="flex flex-col">
                    <div className="flex items-center gap-5 whitespace-nowrap">
                        <p>発駅</p>
                        <Controller
                            name="startStation"
                            control={control}
                            rules={{ required: true }}
                            render={({ field }) => (
                                <SelectStation
                                    instanceId="start-station"
                                    value={field.value}
                                    onChange={(value) => handleFieldChange(value, field.onChange, resetOnStartStationChange)}
                                />
                            )}
                        />
                    </div>

                    {fields.map((item, index) => {
                        const previousStation = index === 0
                            ? formValues.startStation
                            : formValues.segments[index - 1].destinationStation;

                        const previousLine = index > 0 ? formValues.segments[index - 1]?.viaLine : null;

                        const availableLineNames = new Set(previousStation?.lines);

                        const availableLines = previousStation
                            ? lineData
                                .filter(line => availableLineNames.has(line.name))
                                .filter(line => !previousLine || line.name !== previousLine.name)
                            : [];

                        const selectedLine = formValues.segments[index]?.viaLine;

                        const stationsOnLine = selectedLine
                            ? selectedLine.stations
                                .map(name => stationMap.get(name))
                                .filter((station): station is Station => station !== undefined)
                            : [];

                        const isLastStation = index === fields.length - 1;
                        const stationLabel = isLastStation ? "着駅" : "経由";

                        return (
                            <div key={item.id} >
                                <Controller
                                    name={`segments.${index}.viaLine`}
                                    control={control}
                                    rules={{ required: true }}
                                    render={({ field }) => (
                                        <SelectLine
                                            instanceId={`via-line-${index}`}
                                            options={availableLines}
                                            isDisabled={!previousStation}
                                            value={field.value}
                                            onChange={(value) => handleFieldChange(value, field.onChange, () => resetOnViaLineChange(index))}
                                        />
                                    )}
                                />
                                <div className="flex items-center gap-4 whitespace-nowrap">
                                    <p>{stationLabel}</p>
                                    <Controller
                                        name={`segments.${index}.destinationStation`}
                                        control={control}
                                        rules={{ required: true }}
                                        render={({ field }) => (
                                            <SelectStation
                                                instanceId={`dest-station-${index}`}
                                                options={stationsOnLine}
                                                isDisabled={!selectedLine}
                                                value={field.value}
                                                onChange={(value) => handleFieldChange(value, field.onChange, () => resetOnDestinationStationChange(index))}
                                            />
                                        )}
                                    />
                                </div>
                            </div>
                        );
                    })}
                    <div>
                        <button
                            type="button"
                            onClick={addSegment}
                            disabled={!canAddTransfer}
                            className="my-4 px-4 py-2 bg-gray-500 text-white rounded disabled:bg-gray-300"
                        >
                            経由路線を追加
                        </button>
                    </div>
                    <div>
                        <button type="submit" className="px-6 py-2 bg-blue-400 text-black rounded disabled:bg-gray-400 disabled:text-white" disabled={!isValid}>
                            <p>照　会</p>
                        </button>
                    </div>
                </div>
            </form>
            <div className="mt-8 p-4 border-t">
                {isLoading && <p>計算中...</p>}
                {error && <p className="text-red-500">{error}</p>}
                {result && (
                    <div>
                        <h2 className="pb-5 text-2xl">計算結果</h2>
                        <div>営業キロ: {result.totalEigyoKilo} km</div>
                        <div>運賃計算キロ（擬制キロ）: {result.totalGiseiKilo} km</div>
                        <div className="flex justify-between items-center my-3 gap-2">
                            <div className="flex-1 text-right break-words">
                                <div className={`font-bold ${isLongDeparture ? 'text-xl break-words leading-tight' : 'text-2xl flex justify-around'}`}>
                                    {isLongDeparture
                                        ? result.departureStation
                                        : result.departureStation.split('').map((char, idx) => (
                                            <span key={idx}>{char}</span>
                                        ))}
                                </div>
                            </div>
                            <div className="text-2xl shrink-0 px-1 text-center">→</div>
                            <div className="flex-1 text-left break-words">
                                <div className={`font-bold ${isLongArrival ? 'text-xl break-words leading-tight' : 'text-2xl flex justify-around'}`}>
                                    {isLongArrival
                                        ? result.arrivalStation
                                        : result.arrivalStation.split('').map((char, idx) => (
                                            <span key={idx}>{char}</span>
                                        ))}
                                </div>
                            </div>
                        </div>
                        <span>経由：{result.via.length === 0 ? "ーーー" : result.via.join("・")}</span>
                        <span className="flex justify-between items-center">
                            <span>{result.validDays === 1 ? "当日限り有効" : result.validDays + " 日間有効"}</span>
                            <span className="text-xl">¥{result.fare}</span>
                        </span>
                    </div>
                )}
            </div>
        </main>
    );
}