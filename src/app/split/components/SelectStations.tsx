import type { Station } from "@/app/types";
import SelectStation from "./SelectStation";

interface SelectStationsProps {
  instanceId: string;
  describedBy?: string;
  value: Station[];
  onChange: (value: Station[]) => void;
  options: Station[];
  isDisabled?: boolean;
}

export default function SelectStations({
  instanceId,
  describedBy,
  value,
  onChange,
  options,
  isDisabled,
}: SelectStationsProps) {
  return (
    <SelectStation
      instanceId={instanceId}
      describedBy={describedBy}
      className="split-options-search"
      mode="add"
      value={null}
      options={options.filter(option => !value.some(station => station.name === option.name))}
      isDisabled={isDisabled}
      onChange={station => {
        if (station && !value.some(selected => selected.name === station.name)) {
          onChange([...value, station]);
        }
      }}
    />
  );
}
