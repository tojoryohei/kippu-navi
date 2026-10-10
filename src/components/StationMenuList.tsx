import { Children, cloneElement, isValidElement, useCallback, useLayoutEffect, useRef, type ReactElement } from "react";
import { components, type GroupBase, type MenuListProps, type OptionProps } from "react-select";
import { defaultRangeExtractor, useVirtualizer } from "@tanstack/react-virtual";
import type { Station } from "@/app/types";

type Props = MenuListProps<Station, false, GroupBase<Station>>;
type Row = ReactElement<OptionProps<Station, false, GroupBase<Station>>>;

export function StationMenuList(props: Props) {
  const children = Children.toArray(props.children);
  const rows = children.filter((child): child is Row =>
    isValidElement<OptionProps<Station, false, GroupBase<Station>>>(child) && child.props.type === "option",
  );
  // 少数候補には測定処理を足さず、メッセージやグループも通常表示に委ねる。
  if (rows.length <= 10 || rows.length !== children.length) return <components.MenuList {...props} />;
  return <VirtualStationMenu {...props} rows={rows} />;
}

function VirtualStationMenu({ rows, ...props }: Props & { rows: Row[] }) {
  "use no memo";
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const focusedIndex = rows.findIndex(row => row.props.data === props.focusedOption);
  const signature = JSON.stringify(rows.map(row => props.selectProps.getOptionValue(row.props.data)));
  // React Compilerの対象外とし、可変の仮想化インスタンスを直接利用する。
  // eslint-disable-next-line react-hooks/incompatible-library
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 52,
    // 同名の駅も存在するため、react-selectの候補キーを併用する。
    getItemKey: index => `${props.selectProps.getOptionValue(rows[index].props.data)}:${rows[index].key}`,
    overscan: 5,
    paddingStart: 4,
    paddingEnd: 4,
    initialRect: { width: 0, height: props.maxHeight },
    rangeExtractor: range => {
      const indexes = defaultRangeExtractor(range);
      // 読み上げ対象はスクロール範囲外でもDOMに保持する。
      if (focusedIndex >= 0 && !indexes.includes(focusedIndex)) indexes.push(focusedIndex);
      return indexes.sort((a, b) => a - b);
    },
  });
  const { innerRef } = props;
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
    if (typeof innerRef === "function") innerRef(node);
    else if (innerRef) innerRef.current = node;
  }, [innerRef]);

  useLayoutEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [signature, virtualizer]);

  useLayoutEffect(() => {
    if (focusedIndex >= 0) virtualizer.scrollToIndex(focusedIndex, { align: "auto" });
    // スクロールだけでは再実行せず、候補の移動にだけ追従する。
  }, [focusedIndex, signature, virtualizer]);

  return (
    <components.MenuList
      {...props}
      innerRef={setScrollRef}
      innerProps={{ ...props.innerProps, style: { ...props.innerProps.style, padding: 0 } }}
    >
      <div className="station-virtual-space" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map(item => (
          <div
            key={item.key}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="station-virtual-row"
            style={{ transform: `translateY(${item.start}px)` }}
          >
            {cloneElement(rows[item.index], {
              innerProps: {
                ...rows[item.index].props.innerProps,
                "aria-setsize": rows.length,
                "aria-posinset": item.index + 1,
              },
            })}
          </div>
        ))}
      </div>
    </components.MenuList>
  );
}
