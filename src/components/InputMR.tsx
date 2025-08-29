"use client";

import { useForm, Controller, SubmitHandler, useFieldArray } from "react-hook-form";
import type { SingleValue } from "react-select";

import stationData from "@/data/stations.json";
import lineData from "@/data/lines.json";
import SelectStation, { Station } from "@/components/SelectStation";
import SelectLine, { Line } from "@/components/SelectLine";

interface IFormInput {
    startStation: Station | null;
    segments: {
        viaLine: Line | null;
        destinationStation: Station | null;
    }[];
}

const stationMap = new Map(stationData.map(s => [s.id, s]));

export default function InputMR() {
    const { handleSubmit, control, watch, setValue, getValues, formState: { isValid } } = useForm<IFormInput>({
        mode: 'onChange',
        defaultValues: {
            startStation: null,
            segments: [{ viaLine: null, destinationStation: null }],
        },
    });

    const { fields, append } = useFieldArray({ control, name: "segments" });
    const formValues = watch();

    // 「乗り換えを追加」ボタンの表示条件を計算
    const lastSegment = formValues.segments[formValues.segments.length - 1];
    const lastDestination = lastSegment?.destinationStation;
    // 最後の到着駅が選択済みで、かつ乗り換え路線が複数あるか
    const canAddTransfer = lastDestination ? lastDestination.lines.length > 1 : false;

    // フィールドが変更されたときに、それ以降をリセットする関数
    const handleFieldChange = (
        value: SingleValue<Station | Line>,
        fieldOnChange: (value: SingleValue<Station | Line>) => void,
        resetLogic: () => void
    ) => {
        // まずはフィールド自体の値を更新
        fieldOnChange(value);
        // 次に、指定されたリセットロジックを実行
        resetLogic();
    };

    // 出発駅が変更されたときのリセット処理
    const resetOnStartStationChange = () => {
        setValue("segments", [{ viaLine: null, destinationStation: null }]);
    };

    // 経由路線が変更されたときのリセット処理 (index指定)
    const resetOnViaLineChange = (index: number) => {
        setValue(`segments.${index}.destinationStation`, null);
        const newSegments = getValues("segments").slice(0, index + 1);
        setValue("segments", newSegments);
    };

    // 到着駅が変更されたときのリセット処理 (index指定)
    const resetOnDestinationStationChange = (index: number) => {
        const newSegments = getValues("segments").slice(0, index + 1);
        setValue("segments", newSegments);
    };

    const addSegment = () => {
        append({ viaLine: null, destinationStation: null });
    };

    // APIに送信するJSONの「ステップ」部分の型
    interface PathStep {
        stationCode: number;
        lineCode: string | null;
    }

    // APIに送信するJSON全体の型
    interface RouteRequest {
        path: PathStep[];
    }

    const createApiRequestBody = (data: IFormInput): RouteRequest | null => {
        // 出発駅が未選択の場合は処理を中断
        if (!data.startStation) {
            return null;
        }

        // path配列を組み立てる
        const path: PathStep[] = [];

        // 最初の要素として出発駅を追加
        // この時点では次に乗る路線が不明なので、一時的にlineCodeをセットする
        path.push({
            stationCode: data.startStation.id,
            lineCode: data.segments[0]?.viaLine?.id ?? null, // 最初の経由路線のID
        });

        // 経由地・到着地を追加
        data.segments.forEach((segment, index) => {
            if (segment.destinationStation) {
                // 次のセグメント（乗り換え路線）があればそのIDを、なければnullを設定
                const nextLineCode = data.segments[index + 1]?.viaLine?.id ?? null;
                path.push({
                    stationCode: segment.destinationStation.id,
                    lineCode: nextLineCode
                });
            }
        });

        return { path };
    };

    const onSubmit: SubmitHandler<IFormInput> = (data) => {
        console.log("フォームから受け取ったデータ:", data);
        const apiRequestBody = createApiRequestBody(data);
        if (apiRequestBody) {
            console.log("サーバーに送信するJSON:", JSON.stringify(apiRequestBody, null, 2));
            // TODO: ここで fetch や axios を使ってサーバーにapiRequestBodyを送信する
        } else {
            alert("経路データが不完全なため、リクエストを作成できませんでした。");
            alert(JSON.stringify(apiRequestBody, null, 2))
        }
    };

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

                        // 乗り換え可能な路線を計算
                        const availableLineIds = new Set(previousStation?.lines);

                        const availableLines = previousStation
                            ? lineData
                                .filter(line => availableLineIds.has(line.id))
                                .filter(line => !previousLine || line.id !== previousLine.id)
                            : [];

                        const selectedLine = formValues.segments[index]?.viaLine;

                        const stationsOnLine = selectedLine
                            ? selectedLine.stations
                                .map(id => stationMap.get(id))
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
                                <div />
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
        </main>
    );
}