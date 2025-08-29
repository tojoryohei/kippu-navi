"use client";

import Select, { components, OptionProps } from "react-select";

import { Line, SelectLineProps } from "@/types";

const CustomOption = (props: OptionProps<Line>) => (
    <components.Option {...props}>
        <div className="leading-tight text-black">{props.data.name}</div>
    </components.Option>
);

const SelectLine = ({ instanceId, value, onChange, options, isDisabled }: SelectLineProps) => {
    return (
        <div className="my-2 w-47">
            <Select
                instanceId={instanceId}
                value={value}
                onChange={onChange}
                isMulti={false}
                options={options}
                isDisabled={isDisabled}
                placeholder="経由路線を選択"
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
                isSearchable={false}
                components={{
                    DropdownIndicator: () => null,
                    IndicatorSeparator: () => null,
                    Option: CustomOption,
                }}
            />
        </div>
    );
};

export default SelectLine;