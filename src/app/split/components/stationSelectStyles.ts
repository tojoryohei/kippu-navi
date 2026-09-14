import type { CSSProperties } from "react";
import type { StylesConfig } from "react-select";

export function stationSelectStyles<Option, IsMulti extends boolean>(): StylesConfig<Option, IsMulti> {
  return {
    input: base => ({
      ...base,
      opacity: "1 !important" as unknown as number,
      visibility: "visible !important" as unknown as CSSProperties["visibility"],
      color: "inherit",
    }),
  };
}
