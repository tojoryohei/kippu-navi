"use client";

import Select, { components, OptionProps } from "react-select";

import { Line, SelectLineProps } from "@/app/types";

const formatLabel = (option: Line): string => {
    return option.name.split('_')[0];
};

const CustomOption = (props: OptionProps<Line>) => (
    <components.Option {...props}>
        <div className="leading-tight text-black">{formatLabel(props.data)}</div>
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
                getOptionLabel={formatLabel}
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