"use client";

import Select, { components, OptionProps, FilterOptionOption } from "react-select";
import { useState, useEffect, useId } from "react";
import stationData from "@/app/split/data/stations.json";

import { Station, SelectStationProps } from '@/app/types';

const CustomOption = (props: OptionProps<Station>) => (
    <components.Option {...props}>
        <div className="leading-tight text-black">
            <span className="text-xs text-black">{props.data.kana}</span>
            <br />
            {props.data.name}
        </div>
    </components.Option>
);

const CustomInput = (props: any) => {
    return (
        <components.Input
            {...props}
            isHidden={false}
            onFocus={(e: any) => {
                if (props.onFocus) {
                    props.onFocus(e);
                }
                e.target.select();
            }}
        />
    );
};

const SelectStation = ({ instanceId, value, onChange, options, isDisabled }: SelectStationProps) => {
    const stationOptions = options || (stationData as Station[]);
    const [inputValue, setInputValue] = useState<string>("");

    const reactId = useId();
    const safeInstanceId = instanceId || reactId;

    useEffect(() => {
        if (value) {
            setInputValue(value.name);
        } else {
            setInputValue("");
        }
    }, [value]);

    const filterOption = (option: FilterOptionOption<Station>, rawInput: string) => {
        const target = option.data;
        rawInput = rawInput
            .replace(/[jJｊ]/g, 'Ｊ')
            .replace(/[rRｒ]/g, 'Ｒ')
            .replace(/ヶ/g, 'ケ');
        return target.name.includes(rawInput) || target.kana.startsWith(rawInput);
    };

    return (
        <div className="my-2 w-47">
            <Select
                instanceId={safeInstanceId}
                value={value}
                isDisabled={isDisabled}
                options={stationOptions}
                menuIsOpen={inputValue.length > 0 ? undefined : false}

                controlShouldRenderValue={false}
                inputValue={inputValue}

                onInputChange={(newInputValue, { action }) => {
                    // 純粋なタイピングのみを受け付ける
                    if (action === "input-change") {
                        setInputValue(newInputValue);
                        onChange(newInputValue ? { name: newInputValue, kana: newInputValue, lines: [] } : null);
                    }
                }}

                onChange={(newValue) => {
                    // サジェストを選択した時
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

                // ★追加: CSSレベルでも透明化を絶対に許さない（強制表示）
                styles={{
                    input: (base) => ({
                        ...base,
                        opacity: '1 !important' as any,
                        visibility: 'visible !important' as any,
                        color: 'inherit'
                    })
                }}

                components={{
                    DropdownIndicator: () => null,
                    IndicatorSeparator: () => null,
                    Option: CustomOption,
                    Input: CustomInput, // ★ 上記で定義した透明にならないInputを適用
                }}
            />
        </div>
    );
};

export default SelectStation;