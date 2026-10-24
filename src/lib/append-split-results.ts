import type { SplitFareResult } from "@/app/types";

/** 最初の表示結果・分割前運賃・追加順を維持する。 */
export function appendSplitResults(current: SplitFareResult | null, delta: SplitFareResult): SplitFareResult {
  if (!current) return delta;
  const seen = new Set(current.results.map(plan => plan.id ?? JSON.stringify(plan.segments)));
  const additions = delta.results.filter(plan => {
    const key = plan.id ?? JSON.stringify(plan.segments);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { ...current, results: [...current.results, ...additions] };
}
