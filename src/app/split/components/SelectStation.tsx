import StationSelect from "@/components/StationSelect";
import stationData from "@/app/split/data/stationDatas.json";
import type { Station, SelectStationProps } from "@/app/types";

interface Props extends SelectStationProps {
  mode?: "input" | "add";
  describedBy?: string;
  className?: string;
}
export default function SelectStation({ instanceId, value, onChange, options, isDisabled, mode = "input", describedBy, className }: Props) {
  return <StationSelect inputId={instanceId} value={value} onChange={onChange} options={options ?? stationData as Station[]} disabled={isDisabled} mode={mode} describedBy={describedBy} className={className} />;
}
