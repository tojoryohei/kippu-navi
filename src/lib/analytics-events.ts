export type SearchOutcome = "success" | "business_error" | "system_error";

export interface SearchAnalyticsInput {
  searchSurface: "fare" | "split";
  searchUrl: string;
  originStation: string;
  destinationStation: string;
  routeStations: string[];
  routeLines?: string[];
  months?: number;
  maxSplits?: number;
  noSplitStations?: string[];
  isIc?: boolean;
}

export interface SearchResultAnalytics {
  totalFareYen?: number;
  distanceKm?: number;
  normalFareYen?: number;
  bestFareYen?: number;
  savingsYen?: number;
  bestSplitCount?: number;
  candidateCount?: number;
}

export interface SearchCompletedInput {
  searchType: string;
  calculationMode?: string;
  capability: "ticket" | "pass";
  elapsedMs: number;
  engineRecovered: boolean;
  retryCount: number;
  workerRestartCount: number;
  outcome: SearchOutcome;
  errorCode?: string;
  search: SearchAnalyticsInput;
  result?: SearchResultAnalytics;
}

export function buildSearchUrl(location: { origin: string; pathname: string; search: string }) {
  return `${location.origin}${location.pathname}${location.search}`;
}

function elapsedBucket(elapsedMs: number) {
  if (elapsedMs < 250) return "under_250ms";
  if (elapsedMs < 1_000) return "250ms_1s";
  if (elapsedMs < 3_000) return "1s_3s";
  if (elapsedMs < 10_000) return "3s_10s";
  return "over_10s";
}

export function buildSearchCompletedProperties(input: SearchCompletedInput) {
  return {
    search_type: input.searchType,
    calculation_mode: input.calculationMode,
    capability: input.capability,
    elapsed_bucket: elapsedBucket(input.elapsedMs),
    engine_recovered: input.engineRecovered,
    retry_count: input.retryCount,
    worker_restart_count: input.workerRestartCount,
    outcome: input.outcome,
    search_surface: input.search.searchSurface,
    search_url: input.search.searchUrl,
    origin_station: input.search.originStation,
    destination_station: input.search.destinationStation,
    route_stations: input.search.routeStations,
    ...(input.search.routeLines ? { route_lines: input.search.routeLines } : {}),
    ...(input.search.months !== undefined ? { months: input.search.months } : {}),
    ...(input.search.maxSplits !== undefined ? { max_splits: input.search.maxSplits } : {}),
    ...(input.search.noSplitStations ? { no_split_stations: input.search.noSplitStations } : {}),
    ...(input.search.isIc !== undefined ? { is_ic: input.search.isIc } : {}),
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
    ...(input.result?.totalFareYen !== undefined ? { total_fare_yen: input.result.totalFareYen } : {}),
    ...(input.result?.distanceKm !== undefined ? { distance_km: input.result.distanceKm } : {}),
    ...(input.result?.normalFareYen !== undefined ? { normal_fare_yen: input.result.normalFareYen } : {}),
    ...(input.result?.bestFareYen !== undefined ? { best_fare_yen: input.result.bestFareYen } : {}),
    ...(input.result?.savingsYen !== undefined ? { savings_yen: input.result.savingsYen } : {}),
    ...(input.result?.bestSplitCount !== undefined ? { best_split_count: input.result.bestSplitCount } : {}),
    ...(input.result?.candidateCount !== undefined ? { candidate_count: input.result.candidateCount } : {}),
  };
}
