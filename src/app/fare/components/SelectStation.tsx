import StationSelect from "@/components/StationSelect";
import stationData from "@/app/fare/data/stations.json";
import type { Station, SelectStationProps } from "@/app/types";

export default function SelectStation({ instanceId, value, onChange, options, isDisabled, hideMenuWhenEmpty = false }: SelectStationProps & { hideMenuWhenEmpty?: boolean }) {
  // 既存のlabelとの対応を保つため、入力IDは変更しない。
  return <StationSelect inputId={`react-select-${instanceId}-input`} value={value} onChange={onChange} options={options ?? stationData as Station[]} disabled={isDisabled} hideMenuWhenEmpty={hideMenuWhenEmpty} mode="blur" />;
}
