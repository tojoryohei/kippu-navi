export type SearchOutcome = "success" | "business_error" | "system_error";

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
    ...(input.errorCode ? { error_code: input.errorCode } : {}),
  };
}
