"use client";

import Select, { components, OptionProps, FilterOptionOption } from "react-select";
import { useState, useEffect, useId } from "react";
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

const SelectStation = ({ instanceId, value, onChange, options, isDisabled, hideMenuWhenEmpty = false }: ExtendedSelectStationProps) => {
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

    const menuIsOpen = (hideMenuWhenEmpty && inputValue.length === 0) ? false : undefined;

    return (
        <div className="my-2 w-47">
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
                    // 直前の値から変更があった場合のみ処理
                    if (inputValue !== (value?.name || "")) {
                        if (inputValue) {
                            // ★修正: 入力された名前に完全一致する実在の駅を探す
                            const matchedStation = stationOptions.find(s => s.name === inputValue);

                            if (matchedStation) {
                                // 実在する駅なら、その正しいデータ（路線情報を含む）を渡す
                                onChange(matchedStation);
                            } else {
                                // 存在しない駅名の場合は、バリデーションで弾かせるためにダミーを渡す
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
                        opacity: '1 !important' as any,
                        visibility: 'visible !important' as any,
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