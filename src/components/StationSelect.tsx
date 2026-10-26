import { useState } from "react";
import ChoiceSelect from "./ChoiceSelect";
import type { Station } from "@/app/types";

interface Props {
  inputId: string;
  value: Station | null;
  options: Station[];
  onChange: (station: Station | null) => void;
  disabled?: boolean;
  describedBy?: string;
  className?: string;
  hideMenuWhenEmpty?: boolean;
  mode: "blur" | "input" | "add";
}

export default function StationSelect({ inputId, value, options, onChange, disabled, describedBy, className, mode, hideMenuWhenEmpty = true }: Props) {
  const [text, setText] = useState(value?.name ?? "");
  const [previous, setPrevious] = useState(value);
  if (previous !== value) { setPrevious(value); setText(value?.name ?? ""); }
  const freeValue = (input: string) => input ? options.find(option => option.name === input) ?? { name: input, kana: input, lines: [] } : null;
  return <div className="my-2 w-full"><ChoiceSelect
    inputId={inputId} value={value} options={options} disabled={disabled} describedBy={describedBy}
    className={className} hideMenuWhenEmpty={hideMenuWhenEmpty} placeholder="駅名を入力してください" getLabel={station => station.name}
    inputValue={text} onInput={input => { setText(input); if (mode === "input") onChange(freeValue(input)); }}
    onBlur={() => { if (mode === "blur" && text !== (value?.name ?? "")) onChange(freeValue(text)); }}
    onChange={station => { setText(mode === "add" ? "" : station.name); onChange(station); }}
    filter={(station, input) => {
      const normalized = input.replace(/[jJｊ]/g, "Ｊ").replace(/[rRｒ]/g, "Ｒ").replace(/ヶ/g, "ケ");
      return station.name.includes(normalized) || station.kana.startsWith(normalized);
    }}
    renderOption={station => <div className="leading-tight text-black"><span className="text-xs text-black">{station.kana}</span><br />{station.name}</div>}
  /></div>;
}
