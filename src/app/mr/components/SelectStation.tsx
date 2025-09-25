"use client";

import Select, { components, OptionProps, FilterOptionOption } from "react-select";
import { useState } from "react";
import stationData from "@/app/mr/data/stations.json";

import { Station, SelectStationProps } from '@/app/mr/types';

const CustomOption = (props: OptionProps<Station>) => (
    <components.Option {...props}>
        <div className="leading-tight text-black">
            <span className="text-xs text-black">{props.data.kana}</span>
            <br />
            {props.data.name}
        </div>
    </components.Option>
);

const SelectStation = ({ instanceId, value, onChange, options, isDisabled }: SelectStationProps) => {
    const stationOptions = options || stationData;
    const [inputValue, setInputValue] = useState<string>("");

    const filterOption = (option: FilterOptionOption<Station>, rawInput: string) => {
        const target = option.data;
        rawInput = rawInput.replace('ヶ', 'ケ')
        return target.name.startsWith(rawInput) || target.kana.startsWith(rawInput);
    };

    return (
        <div className="my-2 w-47">
            <Select
                instanceId={instanceId}
                value={value}
                onChange={onChange}
                isMulti={false}
                options={stationOptions}
                isDisabled={isDisabled}
                onInputChange={(input) => setInputValue(input)}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
                placeholder="駅名を入力してください"
                isSearchable={true}
                filterOption={filterOption}
                noOptionsMessage={() => (inputValue ? "該当する駅がありません" : null)}
                components={{
                    DropdownIndicator: () => null,
                    IndicatorSeparator: () => null,
                    Option: CustomOption,
                }}
            />
        </div>
    );
};

export default SelectStation;