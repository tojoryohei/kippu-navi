import ChoiceSelect from "@/components/ChoiceSelect";
import type { SelectLineProps } from "@/app/types";

export default function SelectLine({ instanceId, value, onChange, options, isDisabled }: SelectLineProps) {
  return <div className="my-2 w-full"><ChoiceSelect inputId={instanceId} prefix="line-select" label="経由路線" value={value} onChange={onChange} options={options} disabled={isDisabled} placeholder="経由路線を選択" getKey={option => option.name} getLabel={option => option.name.split("_")[0]} /></div>;
}
