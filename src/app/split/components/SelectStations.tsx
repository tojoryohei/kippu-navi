import Select, {
  components,
  type MultiValue,
  type OptionProps,
  type FilterOptionOption,
  type InputProps,
} from "react-select";
import type { CSSProperties, FocusEvent } from "react";
import type { Station } from "@/app/types";

interface SelectStationsProps {
  instanceId: string;
  value: Station[];
  onChange: (value: Station[]) => void;
  options: Station[];
  isDisabled?: boolean;
}

const CustomOption = (props: OptionProps<Station, true>) => (
  <components.Option {...props}>
    <div className="leading-tight text-black">
      <span className="text-xs text-black">{props.data.kana}</span>
      <br />
      {props.data.name}
    </div>
  </components.Option>
);

const CustomInput = (props: InputProps<Station, true>) => (
  <components.Input
    {...props}
    isHidden={false}
    onFocus={(event: FocusEvent<HTMLInputElement>) => {
      props.onFocus?.(event);
      event.target.select();
    }}
  />
);

export default function SelectStations({
  instanceId,
  value,
  onChange,
  options,
  isDisabled,
}: SelectStationsProps) {
  const filterOption = (option: FilterOptionOption<Station>, rawInput: string) => {
    const normalizedInput = rawInput
      .replace(/[jJｊ]/g, "Ｊ")
      .replace(/[rRｒ]/g, "Ｒ")
      .replace(/ヶ/g, "ケ");
    return option.data.name.includes(normalizedInput) || option.data.kana.startsWith(normalizedInput);
  };

  return (
    <Select<Station, true>
      instanceId={instanceId}
      className="station-select"
      classNamePrefix="station-select"
      value={value}
      options={options}
      isDisabled={isDisabled}
      isMulti
      closeMenuOnSelect={false}
      hideSelectedOptions={false}
      isSearchable
      filterOption={filterOption}
      getOptionLabel={(option) => option.name}
      getOptionValue={(option) => option.name}
      onChange={(newValue: MultiValue<Station>) => onChange([...newValue])}
      placeholder="駅名を選択してください"
      noOptionsMessage={() => "該当する駅がありません"}
      components={{ Option: CustomOption, Input: CustomInput }}
      styles={{
        input: (base) => ({
          ...base,
          opacity: "1 !important" as unknown as number,
          visibility: "visible !important" as unknown as CSSProperties["visibility"],
          color: "inherit",
        }),
      }}
    />
  );
}
