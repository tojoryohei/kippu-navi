"use client";

import Select, { components, ActionMeta, OptionProps, SingleValue } from "react-select";
import { useMemo, useState } from "react";
import stationData from '@/data/station.json';

export interface OptionType {
    "id": number;
    "name": string;
    "kana": string;
}

const CustomOption = (props: OptionProps<OptionType>) => {
    return (
        <components.Option {...props}>
            <div style={{ lineHeight: 1.2, color: "black" }}>
                <span style={{ fontSize: "0.75rem", color: "#888" }}>
                    {props.data.kana}
                </span>
                <br />
                {props.data.name}
            </div>
        </components.Option>
    );
};

const SelectStation = () => {
    const allOptions: OptionType[] = stationData;
    const [selectedValue, setSelectedValue] = useState<OptionType | null>(null);
    const [inputValue, setInputValue] = useState<string>("");

    const filterOption = (option: any, rawInput: string) => {
        const input = rawInput.toLowerCase();
        const target = option.data as OptionType;
        // Check if the station name or kana starts with the input
        return (
            target.name.toLowerCase().startsWith(input) ||
            target.kana.toLowerCase().startsWith(input)
        );
    };

    const handleChange = (
        newValue: SingleValue<OptionType>,
        actionMeta: ActionMeta<OptionType>
    ) => {
        setSelectedValue(newValue);
    };

    return (
        <div style={{ width: "250px", margin: "25px" }}>
            <Select
                instanceId="search-select-box"
                value={selectedValue}
                onChange={handleChange}
                isMulti={false}
                options={inputValue ? allOptions : []}
                onInputChange={(input) => setInputValue(input)}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id.toString()}
                placeholder="駅名を入力してください"
                isSearchable={true}
                filterOption={filterOption}
                noOptionsMessage={() =>
                    inputValue ? "該当する駅がありません" : null
                }

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
