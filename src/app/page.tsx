"use client";

import SelectStation, { OptionType } from "@/component/SerectStation";
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
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <main className="max-w-xl mx-auto bg-white rounded-lg shadow-md p-6">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-6">
          JR運賃計算サイト
        </h1>

        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2">
            出発駅を選択してください:
          </label>
          <SelectStation
            instanceId="start-station-select"
            value={startStation}
            onChange={handleStartChange}
          />
        </div>

        <div className="mb-6">
          <label className="block text-gray-700 font-medium mb-2">
            到着駅を選択してください:
          </label>
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
