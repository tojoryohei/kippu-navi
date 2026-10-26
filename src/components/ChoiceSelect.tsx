/* eslint-disable jsx-a11y/click-events-have-key-events -- キー操作はcombobox入力に集約し、候補はaria-activedescendantで参照する。 */
import { useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";

interface Props<T> {
  inputId?: string;
  label?: string;
  describedBy?: string;
  className?: string;
  prefix?: "station-select" | "line-select";
  options: T[];
  value: T | null;
  getLabel: (option: T) => string;
  getKey?: (option: T) => string;
  renderOption?: (option: T) => ReactNode;
  onChange: (option: T) => void;
  disabled?: boolean;
  placeholder?: string;
  inputValue?: string;
  onInput?: (value: string) => void;
  onBlur?: () => void;
  hideMenuWhenEmpty?: boolean;
  filter?: (option: T, input: string) => boolean;
}

/** 駅検索・路線・分割回数で共有する、外部CSSだけで装飾する単一選択UI。 */
export default function ChoiceSelect<T>({ inputId, label, describedBy, className = "", prefix = "station-select", options, value, getLabel, getKey = getLabel, renderOption, onChange, disabled, placeholder, inputValue, onInput, onBlur, filter, hideMenuWhenEmpty = true }: Props<T>) {
  const generatedId = useId();
  const id = inputId ?? generatedId;
  const input = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const [navigation, setNavigation] = useState({ index: 0 });
  const moveActive = (index: number) => { setActive(index); setNavigation({ index }); };
  const searchable = onInput !== undefined;
  const text = inputValue ?? (value ? getLabel(value) : "");
  const filtered = searchable && filter ? options.filter(option => filter(option, text)) : options;
  const shown = open && !disabled && (!searchable || text.length > 0 || !hideMenuWhenEmpty);
  const selectedIndex = value ? filtered.findIndex(option => getKey(option) === getKey(value)) : -1;
  const activeIndex = Math.min(active, filtered.length - 1);
  const select = (option: T) => {
    onChange(option);
    setOpen(false);
    input.current?.focus({ preventScroll: true });
  };
  return <div className={`${prefix} ${className}`}>
    {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 余白クリックも内部のcomboboxへフォーカスする。 */}
    <div className={`${prefix}__control${disabled ? ` ${prefix}__control--is-disabled` : ""}${focused ? ` ${prefix}__control--is-focused` : ""}`}
      onClick={() => { if (!disabled) { input.current?.focus(); if (!searchable && !open) moveActive(Math.max(0, selectedIndex)); setOpen(searchable ? true : !open); } }}>
      <div className={`${prefix}__value-container`}>
        {!searchable && <span className={`${prefix}__${value ? "single-value" : "placeholder"}`}>{text || placeholder}</span>}
        <input ref={input} id={id} role="combobox" type="text" autoComplete="off" disabled={disabled}
          className={`choice-input${searchable ? "" : " choice-input-readonly"}`}
          aria-label={label} aria-describedby={describedBy} aria-expanded={shown}
          aria-controls={shown ? `${id}-listbox` : undefined} aria-autocomplete={searchable ? "list" : "none"}
          aria-activedescendant={shown && activeIndex >= 0 ? `${id}-option-${activeIndex}` : undefined}
          readOnly={!searchable} value={text} placeholder={searchable ? placeholder : undefined}
          onFocus={event => { setFocused(true); if (searchable) { event.target.select(); setOpen(true); } }}
          onBlur={() => { setFocused(false); setOpen(false); onBlur?.(); }}
          onChange={event => { onInput?.(event.target.value); moveActive(0); setOpen(true); }}
          onCompositionStart={() => { composing.current = true; }} onCompositionEnd={() => { composing.current = false; }}
          onKeyDown={event => {
            // SafariのIME確定キーはcompositionend後も旧keyCode=229になるため併用する。
            if (composing.current || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
            if (event.key === "Escape") { if (shown) { event.preventDefault(); event.stopPropagation(); } setOpen(false); return; }
            if (event.key === "Tab") { if (!event.shiftKey && shown && filtered[activeIndex]) select(filtered[activeIndex]); setOpen(false); return; }
            if (event.key === "Enter" || (!searchable && event.key === " ")) {
              if (!shown && searchable) return;
              event.preventDefault();
              if (shown && filtered[activeIndex]) select(filtered[activeIndex]);
              else if (!searchable) { moveActive(Math.max(0, selectedIndex)); setOpen(true); }
              return;
            }
            if (!["ArrowDown", "ArrowUp", "Home", "End", "PageDown", "PageUp"].includes(event.key)) return;
            if (!shown && searchable && !["ArrowDown", "ArrowUp"].includes(event.key)) return;
            event.preventDefault(); setOpen(true);
            const last = filtered.length - 1;
            if (!shown && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
              moveActive(selectedIndex >= 0 ? selectedIndex : event.key === "ArrowUp" ? last : 0);
              return;
            }
            moveActive(event.key === "Home" ? 0 : event.key === "End" ? last : Math.max(0, Math.min(last, (shown ? activeIndex : -1) + (event.key === "ArrowUp" ? -1 : event.key === "PageUp" ? -5 : event.key === "PageDown" ? 5 : 1))));
          }} />
      </div>
    </div>
    <span className="choice-announcement" aria-live="polite" aria-atomic="true">{shown ? `${filtered.length}件の候補${activeIndex >= 0 ? `、${getLabel(filtered[activeIndex])}、${activeIndex + 1}番目` : ""}` : ""}</span>
    {shown && <ChoiceMenu key={text} id={id} prefix={prefix} options={filtered} active={activeIndex} navigation={navigation} onHover={setActive} value={value} getLabel={getLabel} getKey={getKey} renderOption={renderOption} select={select} />}
  </div>;
}

function ChoiceMenu<T>({ id, prefix, options, active, navigation, onHover, value, getLabel, getKey, renderOption, select }: { id: string; prefix: string; options: T[]; active: number; navigation: { index: number }; onHover: (index: number) => void; value: T | null; getLabel: (option: T) => string; getKey: (option: T) => string; renderOption?: (option: T) => ReactNode; select: (option: T) => void }) {
  "use no memo";
  const scroll = useRef<HTMLDivElement>(null);
  const space = useRef<HTMLDivElement>(null);
  const virtual = options.length > 10;
  // 仮想化インスタンスは可変のため、React Compilerの対象外とする。
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: virtual ? options.length : 0, getScrollElement: () => scroll.current,
    estimateSize: () => 52, overscan: 5, paddingStart: 4, paddingEnd: 4,
    initialRect: { width: 0, height: 300 },
    rangeExtractor: range => {
      const indexes = defaultRangeExtractor(range);
      if (active >= 0 && !indexes.includes(active)) indexes.push(active);
      return indexes.sort((a, b) => a - b);
    },
  });
  useLayoutEffect(() => {
    if (space.current) space.current.style.height = `${virtualizer.getTotalSize()}px`;
  });
  useLayoutEffect(() => {
    const index = navigation.index;
    if (index < 0) return;
    if (virtual) virtualizer.scrollToIndex(index, { align: "auto" });
    else document.getElementById(`${id}-option-${index}`)?.scrollIntoView({ block: "nearest" });
  }, [navigation, virtual, virtualizer, id]);
  const option = (item: T, index: number) => <div id={`${id}-option-${index}`} role="option" tabIndex={-1} aria-selected={value !== null && getKey(item) === getKey(value)}
    aria-setsize={options.length} aria-posinset={index + 1}
    className={`${prefix}__option${index === active ? ` ${prefix}__option--is-focused` : ""}${value !== null && getKey(item) === getKey(value) ? ` ${prefix}__option--is-selected` : ""}`}
    onPointerMove={event => {
      // ホイールやタッチによる移動で候補フォーカスを変えず、スクロールを引き戻さない。
      if (event.pointerType === "mouse" && (event.movementX || event.movementY)) onHover(index);
    }} onClick={() => select(item)}>{renderOption ? renderOption(item) : getLabel(item)}</div>;
  return <div className={`${prefix}__menu`}>
    <div ref={scroll} id={`${id}-listbox`} role="listbox" tabIndex={-1} aria-label="候補" className={`${prefix}__menu-list${virtual ? " choice-virtual-menu" : ""}`}
      onMouseDown={event => event.preventDefault()}>
      {options.length === 0 && <div className={`${prefix}__menu-notice ${prefix}__menu-notice--no-options`}>該当する駅がありません</div>}
      {virtual ? <div ref={space} className="station-virtual-space">{virtualizer.getVirtualItems().map(item => <div key={item.key} data-index={item.index} className="station-virtual-row" ref={node => {
        if (node) { node.style.transform = `translateY(${item.start}px)`; virtualizer.measureElement(node); }
      }}>{option(options[item.index], item.index)}</div>)}</div> : options.map((item, index) => <div key={index}>{option(item, index)}</div>)}
    </div>
  </div>;
}
