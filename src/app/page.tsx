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
    <div>
      <main>
        <h1>JR運賃計算サイト</h1>

        <p>出発駅を選択してください:</p>
        <SelectStation
          instanceId="start-station-select"
          value={startStation}
          onChange={handleStartChange}
        />

        <p>到着駅を選択してください:</p>
        <SelectStation
          instanceId="end-station-select"
          value={endStation}
          onChange={handleEndChange}
        />

        <hr />

        <div>
          <h2>選択された駅の情報:</h2>
          <p>出発駅ID: {startStation ? "△" + startStation.id : "未選択"}</p>
          <p>到着駅ID: {endStation ? "△" + endStation.id : "未選択"}</p>
        </div>
      </main>
    </div>
  );
}
