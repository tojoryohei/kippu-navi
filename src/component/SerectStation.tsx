"use client";

import Select, { components, OptionProps, SingleValue } from "react-select";
import { useMemo, useState } from "react";
import stationData from '@/data/station.json';

export interface OptionType {
    "id": number;
    "name": string;
    "kana": string;
}

interface SelectStationProps {
    instanceId: string;
    value: OptionType | null;
    onChange: (newValue: SingleValue<OptionType>) => void;
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

const SelectStation = ({ instanceId, value, onChange }: SelectStationProps) => {
    const allOptions: OptionType[] = stationData;
    const [inputValue, setInputValue] = useState<string>("");

    const filterOption = (option: any, rawInput: string) => {
        const input = rawInput;
        const target = option.data as OptionType;
        return (
            target.name.includes(input) ||
            target.kana.includes(input)
        );
    };

    return (
        <div style={{ width: "250px", margin: "25px" }}>
            <Select
                instanceId={instanceId}
                value={value}
                onChange={onChange}
                isMulti={false}
                options={inputValue ? allOptions : []}
                onInputChange={(input) => setInputValue(input)}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.id.toString()}
                placeholder="駅名を入力してください"
                isSearchable={true}
                filterOption={filterOption}
                noOptionsMessage={() => inputValue ? "該当する駅がありません" : null}
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
