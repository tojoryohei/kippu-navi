import { useState } from "react";
import { HiChevronDown, HiChevronUp } from "react-icons/hi";
import type { SplitFareResult } from "@/app/types";

export default function SplitResults({ result, searchedTypeLabel = "乗車券", beforeLabel }: { result: SplitFareResult; searchedTypeLabel?: string; beforeLabel?: string }) {
    const [showAllPatterns, setShowAllPatterns] = useState(false);
    return (
        <div className="border-t pt-8 space-y-8">
            <h2 className="text-2xl font-bold text-center mb-6">計算結果</h2>

            <section className="bg-gray-50 p-6 rounded-lg shadow-sm border border-gray-200">
                <h3 className="font-bold text-lg mb-4 text-gray-700 border-b pb-2">{beforeLabel || `分割前の${searchedTypeLabel}`}</h3>
                <div className="flex justify-between items-center">
                    <div>
                        <div className="text-lg font-bold">
                            <span>{result.normal.departureStation}</span>
                            <span className="text-gray-400 mx-2">{searchedTypeLabel === "乗車券" ? "→" : "↔"}</span>
                            <span>{result.normal.arrivalStation}</span>
                            {result.normal.totalEigyoKilo > 0 && (
                                <span className="text-sm font-normal text-gray-600 ml-1">
                                    （{(result.normal.totalEigyoKilo / 10).toFixed(1)}km）
                                </span>
                            )}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                            経由：{result.normal.printedViaLines.join("・") || "---"}
                        </div>
                    </div>
                    <div className="text-3xl font-bold text-gray-800">
                        ¥{result.normal.fare.toLocaleString()}
                    </div>
                </div>
            </section>

            {result.results.length > 0 ? (
                <div className="space-y-6">
                    {(() => {
                        const bestFare = result.results[0].totalFare;
                        const diff = result.normal.fare - bestFare;
                        const isCheaper = diff > 0;

                        return (
                            <section className={`p-6 rounded-lg shadow-md border-2 ${isCheaper ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white"}`}>
                                <div className="flex justify-between items-center">
                                    <div>
                                        <h3 className="font-bold text-xl text-blue-800">
                                            {"最安分割運賃"}
                                        </h3>
                                        {isCheaper ? (
                                            <p className="text-red-600 font-bold mt-1 text-lg">
                                                {diff.toLocaleString()}円安くなりました！
                                            </p>
                                        ) : (
                                            <p className="text-gray-500 text-sm mt-1">{diff === 0 ? "分割前運賃と同じ" : `分割前より${(-diff).toLocaleString()}円高くなります`}</p>
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
                        {result.results.map((splitPlan, planIndex) => {
                            if (!showAllPatterns && planIndex > 1) return null;

                            const isFadedItem = !showAllPatterns && planIndex === 1;

                            return (
                                <div
                                    key={planIndex}
                                    className={`bg-gray-50 rounded-lg border border-gray-200 relative transition-all duration-300 ${isFadedItem ? "h-32 overflow-hidden" : "p-4"
                                        }`}
                                >
                                    <div className={isFadedItem ? "p-4" : ""}>
                                        {result.results.length > 1 && (
                                            <h4 className="font-bold text-gray-700 mb-3 ml-1">
                                                パターン {planIndex + 1}
                                            </h4>
                                        )}

                                        <div className="flex flex-col gap-3">
                                            {splitPlan.segments.map((segment, segIndex) => (
                                                <div key={segIndex} className="bg-white p-4 rounded border border-gray-200 shadow-sm relative">
                                                    <div className="text-sm text-gray-500 mb-1 flex items-center">
                                                        <span className="bg-gray-200 text-gray-700 px-2 py-0.5 rounded text-xs mr-2">利用区間</span>
                                                        <span>{segment.departureStation} {searchedTypeLabel === "乗車券" ? "→" : "↔"} {segment.arrivalStation}</span>
                                                    </div>

                                                    <div className="flex justify-between items-center mt-2">
                                                        <div className="flex-1">
                                                            <div className="text-lg font-bold text-gray-800 flex items-center flex-wrap gap-2">
                                                                <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded text-xs">切符</span>
                                                                <span>{segment.fare.departureStation}</span>
                                                                <span className="text-gray-400">{searchedTypeLabel === "乗車券" ? "→" : "↔"}</span>
                                                                <span>{segment.fare.arrivalStation}</span>
                                                                {segment.fare.totalEigyoKilo > 0 && (
                                                                    <span className="text-sm font-normal text-gray-600 ml-1">
                                                                        （{(segment.fare.totalEigyoKilo / 10).toFixed(1)}km）
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-1 ml-10">
                                                                経由：{segment.fare.printedViaLines.length === 0 ? "---" : segment.fare.printedViaLines.join("・")}
                                                            </div>
                                                        </div>
                                                        <div className="font-bold text-xl ml-4">
                                                            ¥{segment.fare.fare.toLocaleString()}
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

                        {showAllPatterns && result.results.length > 1 && (
                            <div className="flex justify-center mt-8 pb-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAllPatterns(false);
                                    }}
                                    className="px-5 py-2.5 bg-white border border-gray-300 text-gray-600 font-medium rounded-full hover:bg-gray-50 transition-colors shadow-sm flex items-center gap-2 text-sm"
                                >
                                    <HiChevronUp className="text-lg" />
                                    {"追加のパターンを閉じる"}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-center text-gray-500">有効な分割候補が見つかりませんでした。</p>
            )}
        </div>
    );
}
