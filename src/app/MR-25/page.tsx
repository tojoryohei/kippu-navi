"use client";

import SelectStation, { OptionType } from "@/component/serectStation";
import { useState } from "react";
import { SingleValue } from "react-select";

export default function Home() {
  const [startStation, setStartStation] = useState<OptionType | null>(null);
  const [endStation, setEndStation] = useState<OptionType | null>(null);

  const handleStartChange = (newValue: SingleValue<OptionType>) => {
    setStartStation(newValue);
  };

  const handleEndChange = (newValue: SingleValue<OptionType>) => {
    setEndStation(newValue);
  };

  return (
    <div className="min-h-screen bg-yellow-50 py-10 px-4">
      <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
        JR運賃計算サイト（経路入力）
      </h1>
      <main className="max-w-xl mx-auto bg-gray-100 p-6">
        <div className="flex items-center gap-2 sm:gap-4 mb-6">
          <label htmlFor="start-station-select" className="w-12 sm:w-16 font-medium text-black flex-shrink-0">
            出発
          </label>
          <div className="flex-grow">
            <SelectStation
              instanceId="start-station-select"
              value={startStation}
              onChange={handleStartChange}
            />
          </div>
        </div>
        <div className="mb-6">
          <SelectStation
            instanceId="end-station-select"
            value={endStation}
            onChange={handleEndChange}
          />
        </div>

        <hr className="border-t border-gray-300 my-6" />

        <div className="bg-gray-100 rounded-md p-4">
          <h2 className="text-lg font-semibold text-gray-800 mb-2">
            選択された駅の情報
          </h2>
          <p className="text-gray-700">
            出発駅ID:{" "}
            <span className="font-mono">
              {startStation ? "△" + startStation.id : "未選択"}
            </span>
          </p>
          <p className="text-gray-700">
            到着駅ID:{" "}
            <span className="font-mono">
              {endStation ? "△" + endStation.id : "未選択"}
            </span>
          </p>
        </div>
      </main>
    </div>
  );
}
