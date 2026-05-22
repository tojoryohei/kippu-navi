"use client";

import Select, { components, OptionProps, FilterOptionOption, InputProps } from "react-select";
import { useState, useId, FocusEvent, CSSProperties } from "react";
import stationData from "@/app/mr/data/stations.json";

import { Station, SelectStationProps } from '@/app/types';

interface ExtendedSelectStationProps extends SelectStationProps {
    hideMenuWhenEmpty?: boolean;
}

const CustomOption = (props: OptionProps<Station>) => (
    <components.Option {...props}>
        <div className="leading-tight text-black">
            <span className="text-xs text-black">{props.data.kana}</span>
            <br />
            {props.data.name}
        </div>
    </components.Option>
);

const CustomInput = (props: InputProps<Station, false>) => {
    return (
        <components.Input
            {...props}
            isHidden={false}
            onFocus={(e: FocusEvent<HTMLInputElement>) => {
                if (props.onFocus) {
                    props.onFocus(e);
                }
                e.target.select();
            }}
        />
    );
};

const SelectStation = ({ instanceId, value, onChange, options, isDisabled, hideMenuWhenEmpty = false }: ExtendedSelectStationProps) => {
    const stationOptions = options || (stationData as Station[]);

    const [inputValue, setInputValue] = useState<string>(value ? value.name : "");

    const reactId = useId();
    const safeInstanceId = instanceId ?? reactId;

    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        setInputValue(value ? value.name : "");
    }

    const filterOption = (option: FilterOptionOption<Station>, rawInput: string) => {
        const target = option.data;
        const normalizedInput = rawInput
            .replace(/[jJｊ]/g, 'Ｊ')
            .replace(/[rRｒ]/g, 'Ｒ')
            .replace(/ヶ/g, 'ケ');
        return target.name.includes(normalizedInput) || target.kana.startsWith(normalizedInput);
    };

    const menuIsOpen = (hideMenuWhenEmpty && inputValue.length === 0) ? false : undefined;

    return (
        <div className="my-2 w-full">
            <Select
                instanceId={safeInstanceId}
                value={value}
                isDisabled={isDisabled}
                options={stationOptions}
                menuIsOpen={menuIsOpen}
                controlShouldRenderValue={false}
                inputValue={inputValue}
                blurInputOnSelect={false}
                backspaceRemovesValue={false}

                onInputChange={(newInputValue, { action }) => {
                    if (action === "input-change") {
                        setInputValue(newInputValue);
                    }
                }}

                onBlur={() => {
                    if (inputValue !== (value?.name || "")) {
                        if (inputValue) {
                            const matchedStation = stationOptions.find(s => s.name === inputValue);
                            if (matchedStation) {
                                onChange(matchedStation);
                            } else {
                                onChange({ name: inputValue, kana: inputValue, lines: [] });
                            }
                        } else {
                            onChange(null);
                        }
                    }
                }}

                onChange={(newValue) => {
                    if (newValue) {
                        setInputValue(newValue.name);
                        onChange(newValue);
                    } else {
                        setInputValue("");
                        onChange(null);
                    }
                }}

                isMulti={false}
                getOptionLabel={(option) => option.name}
                getOptionValue={(option) => option.name}
                placeholder="駅名を入力してください"
                isSearchable={true}
                filterOption={filterOption}
                noOptionsMessage={() => (inputValue ? "該当する駅がありません" : null)}

                styles={{
                    input: (base) => ({
                        ...base,
                        opacity: '1 !important' as unknown as number,
                        visibility: 'visible !important' as unknown as CSSProperties['visibility'],
                        color: 'inherit'
                    })
                }}

                components={{
                    DropdownIndicator: () => null,
                    IndicatorSeparator: () => null,
                    Option: CustomOption,
                    Input: CustomInput,
                }}
            />
        </div>
    );
};

export default SelectStation;
