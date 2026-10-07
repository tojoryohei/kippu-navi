import { useRef } from "react";
import Select from "react-select";
import { RiArrowDownSLine, RiCloseFill } from "react-icons/ri";
import type { Station } from "@/app/types";
import SelectStations from "@/app/split/components/SelectStations";

const splitOptions = Array.from({ length: 11 }, (_, value) => ({
  value,
  label: value === 0 ? "制限なし" : `${value}回`,
}));

interface AdvancedOptionsProps {
  isIcPass: boolean;
  stationSelection?: "search" | "checkbox";
  stationStatus?: string;
  stationsDisabled?: boolean;
  maxSplits: number;
  onMaxSplitsChange: (value: number) => void;
  stations: Station[];
  options: Station[];
  onStationsChange: (value: Station[]) => void;
}

export default function AdvancedOptions({ stationSelection = "search", stationStatus, stationsDisabled, isIcPass, maxSplits, onMaxSplitsChange, stations, options, onStationsChange }: AdvancedOptionsProps) {
  const searchContainer = useRef<HTMLDivElement>(null);
  const fieldClass = "min-h-[38px] w-full rounded border border-gray-300 bg-white px-2 py-1 text-base";

  const removeStation = (name: string) => {
    onStationsChange(stations.filter(station => station.name !== name));
    searchContainer.current?.querySelector("input")?.focus();
  };

  return (
    <details className="group w-full min-w-0 rounded border border-slate-200 bg-slate-50">
      <summary className="cursor-pointer list-none rounded-xl px-4 py-3 text-slate-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-3">
          <span className="text-base font-semibold">詳細オプション</span>
          <RiArrowDownSLine aria-hidden="true" className="size-5 shrink-0 text-slate-500 transition-transform group-open:rotate-180" />
        </span>
      </summary>
      <div className="border-t border-slate-200 px-4">
        <div className="space-y-2 py-3">
          {isIcPass ? (
            <>
              <p className="text-sm font-semibold text-slate-800">最大分割数</p>
              <p className={`${fieldClass} flex items-center`}>1回（固定）</p>
              <p className="text-sm leading-relaxed text-slate-600">1枚のICカードにまとめるため、IC定期券は1回分割までです。</p>
            </>
          ) : (
            <>
              <label htmlFor="max-splits" className="block text-sm font-semibold text-slate-800">最大分割数</label>
              <Select
                instanceId="max-splits"
                inputId="max-splits"
                aria-describedby="max-splits-help"
                className="station-select split-options-search split-count-select min-w-0"
                classNamePrefix="station-select"
                options={splitOptions}
                value={splitOptions.find(option => option.value === maxSplits)}
                onChange={option => { if (option) onMaxSplitsChange(option.value); }}
                isSearchable={false}
                isClearable={false}
                components={{ DropdownIndicator: null, IndicatorSeparator: null }}
              />
              <p id="max-splits-help" className="text-sm leading-relaxed text-slate-600">1回の分割で乗車券・定期券は2枚になります。</p>
            </>
          )}
        </div>
        <div className="space-y-2 border-t border-slate-200 py-3">
          <div>
            {stationSelection === "search" ? (
              <label htmlFor="no-split-stations" className="block text-sm font-semibold text-slate-800">分割禁止駅</label>
            ) : (
              <p className="block text-sm font-semibold text-slate-800">分割禁止駅</p>
            )}
            <p id="no-split-stations-help" className="mt-1 text-sm leading-relaxed text-slate-600">選択した駅では分割しません。</p>
          </div>
          <div ref={searchContainer}>
            {stationSelection === "checkbox" ? (
              <fieldset disabled={stationsDisabled} className="max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                <legend className="sr-only">分割禁止駅を選択</legend>
                {options.map(station => <label key={station.name} className="flex min-h-11 cursor-pointer items-center gap-3 rounded px-2 hover:bg-blue-50">
                  <input type="checkbox" checked={stations.some(selected => selected.name === station.name)} onChange={event => onStationsChange(event.target.checked ? [...stations, station] : stations.filter(selected => selected.name !== station.name))} />
                  <span>{station.name}</span>
                </label>)}
                {!stationsDisabled && options.length === 0 && <p className="p-2 text-sm text-slate-600">分割できる途中駅はありません。</p>}
              </fieldset>
            ) : <SelectStations instanceId="no-split-stations" describedBy="no-split-stations-help" value={stations} options={options} onChange={onStationsChange} />}
            {stationStatus && <p role="status" className="mt-2 text-sm text-slate-600">{stationStatus}</p>}
          </div>
          <p className="text-sm text-slate-600" role="status">選択済み：{stations.length}駅</p>
          {stationSelection === "search" &&
            <ul id="selected-no-split-stations" aria-label="分割しない駅の一覧" className="flex flex-wrap gap-2">
              {stations.map(station => (
                <li key={station.name} className="flex max-w-full items-center rounded border border-slate-200 bg-white pr-3 text-m text-slate-700">
                  <button type="button" onClick={() => removeStation(station.name)} aria-label={`${station.name}を分割しない駅から削除`} className="flex min-h-8 min-w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-500 focus-visible:outline-2 focus-visible:outline-blue-500">
                    <RiCloseFill className="size-4" />
                  </button>
                  <span className="min-w-0 break-all py-1.5">{station.name}</span>
                </li>
              ))}
            </ul>
          }
        </div>
      </div>
    </details>
  );
}
