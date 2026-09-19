export type EngineCapability = "ticket" | "pass";

export type SearchErrorCode =
  | "engine_asset_fetch_failed"
  | "engine_initialization_failed"
  | "engine_initialization_timeout"
  | "worker_creation_failed"
  | "worker_runtime_failed"
  | "wasm_instantiation_failed"
  | "graph_initialization_failed"
  | "api_network_failed"
  | "api_http_failed"
  | "api_response_invalid"
  | "path_invalid"
  | "calculation_failed"
  | "duplicate_route"
  | "unknown";

const DUPLICATE_ROUTE_ERROR = "経路が重複しています。";
const INVALID_REQUEST_INTERVAL_ERROR = "再考：要求区間誤り";

export function classifyCalculationError(message: string): SearchErrorCode {
  if (message === DUPLICATE_ROUTE_ERROR) return "duplicate_route";
  if (message === INVALID_REQUEST_INTERVAL_ERROR) return "path_invalid";
  return "calculation_failed";
}

export type SearchErrorStage =
  | "api_fetch"
  | "api_response_parse"
  | "api_response_validate"
  | "worker_create"
  | "worker_bootstrap"
  | "wasm_fetch"
  | "wasm_instantiate"
  | "pass_graph_fetch"
  | "pass_graph_initialize"
  | "ticket_graph_fetch"
  | "ticket_graph_initialize"
  | "calculation"
  | "calculation_result_parse";

export interface SearchErrorDetails {
  message: string;
  code: SearchErrorCode;
  source: "client" | "worker" | "wasm" | "api";
  stage: SearchErrorStage;
  exceptionName?: string;
  httpStatus?: number;
  capability?: EngineCapability;
  retryable: boolean;
  retryCount: number;
  workerRestartCount: number;
  pathCount?: number;
  invalidPathCount?: number;
  minimumPathLength?: number;
}

export class SearchOperationError extends Error {
  readonly details: SearchErrorDetails;

  constructor(details: SearchErrorDetails) {
    super(details.message);
    this.name = details.exceptionName || "SearchOperationError";
    this.details = details;
  }
}
