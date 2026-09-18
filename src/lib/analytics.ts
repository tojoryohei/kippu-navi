import posthog from "posthog-js";
import type { EngineReadiness } from "@/lib/engine-client";
import { SearchOperationError, type EngineCapability, type SearchErrorDetails } from "@/lib/search-errors";

const posthogKey = import.meta.env.PUBLIC_POSTHOG_KEY;
const gaId = import.meta.env.PUBLIC_GOOGLE_ANALYTICS_ID;
let initialized = false;

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (posthogKey) {
    posthog.init(posthogKey, {
      api_host: "/ingest",
      ui_host: "https://us.posthog.com",
      person_profiles: "never",
      capture_pageview: false,
      disable_session_recording: true,
      autocapture: false,
      capture_performance: false,
    });
  }
  if (gaId) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () {
      window.dataLayer?.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", gaId, { send_page_view: false });
    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gaId)}`;
    document.head.append(script);
  }
}

export const analytics = {
  capture(event: string, properties?: Record<string, unknown>) {
    initialize();
    if (posthogKey) posthog.capture(event, { ...releaseProperties(), ...properties });
  },
};

const DUPLICATE_ROUTE_ERROR = "経路が重複しています。";

export function getCalculationErrorType(error: string) {
  return error === DUPLICATE_ROUTE_ERROR ? "duplicate_route" : "calculation_error";
}

export interface SearchEventContext {
  searchId: string;
  startedAt: number;
  capability: EngineCapability;
  searchType: string;
  calculationMode?: string;
  fromStation?: string;
  toStation?: string;
  route?: string;
  maxSplits?: number;
  noSplitStations?: string[];
  readiness?: EngineReadiness;
}

function releaseProperties() {
  return {
    engine_version: __WASM_VERSION__,
    app_version: __APP_VERSION__,
    deploy_commit: __DEPLOY_COMMIT__,
    environment: __DEPLOY_ENVIRONMENT__,
  };
}

function sanitizeMessage(message: string) {
  return message.replace(/https?:\/\/[^\s]+/g, value => {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname}`;
    } catch {
      return value.split("?")[0];
    }
  }).slice(0, 500);
}

function fingerprint(details: SearchErrorDetails) {
  const value = [details.code, details.stage, details.capability || "", details.httpStatus || "", __WASM_VERSION__].join("|");
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) hash = Math.imul(hash ^ value.charCodeAt(i), 16777619);
  return `v1-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

export function createSearchId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeSearchError(error: unknown, capability: EngineCapability): SearchOperationError {
  if (error instanceof SearchOperationError) return error;
  const exception = error instanceof Error ? error : new Error(String(error));
  const duplicate = exception.message === DUPLICATE_ROUTE_ERROR;
  return new SearchOperationError({
    message: exception.message,
    code: duplicate ? "duplicate_route" : "calculation_failed",
    source: "client",
    stage: "calculation",
    exceptionName: exception.name,
    capability,
    retryable: false,
    retryCount: 0,
    workerRestartCount: 0,
  });
}

function searchProperties(context: SearchEventContext) {
  return {
    search_id: context.searchId,
    search_type: context.searchType,
    calculation_mode: context.calculationMode,
    from_station: context.fromStation,
    to_station: context.toStation,
    route: context.route,
    max_splits: context.maxSplits,
    no_split_stations: context.noSplitStations,
    capability: context.capability,
  };
}

export function captureSearchError(error: unknown, context: SearchEventContext) {
  const normalized = normalizeSearchError(error, context.capability);
  const details = normalized.details;
  analytics.capture("search_error", {
    ...searchProperties(context),
    error_code: details.code,
    error_source: details.source,
    error_stage: details.stage,
    error_fingerprint: fingerprint(details),
    error_message: sanitizeMessage(details.message),
    exception_name: details.exceptionName,
    http_status: details.httpStatus,
    retryable: details.retryable,
    retry_count: details.retryCount,
    worker_restart_count: details.workerRestartCount,
    elapsed_ms: Math.round(performance.now() - context.startedAt),
    browser_online: typeof navigator === "undefined" ? undefined : navigator.onLine,
    path_count: details.pathCount,
    invalid_path_count: details.invalidPathCount,
    minimum_path_length: details.minimumPathLength,
  });
  return normalized;
}

export function captureEngineRecovery(readiness: EngineReadiness, context: SearchEventContext) {
  if (!readiness.recovered) return;
  const initial = readiness.initialError;
  analytics.capture("engine_recovery", {
    ...searchProperties(context),
    recovered_stage: initial?.stage,
    initial_error_code: initial?.code || "engine_asset_fetch_failed",
    error_fingerprint: initial ? fingerprint(initial) : undefined,
    retry_count: readiness.retryCount,
    worker_restart_count: readiness.workerRestartCount,
    recovery_ms: Math.round(readiness.recoveryMs),
  });
}

export function successfulSearchProperties(context: SearchEventContext) {
  return {
    ...searchProperties(context),
    engine_recovered: Boolean(context.readiness?.recovered),
    retry_count: context.readiness?.retryCount || 0,
    elapsed_ms: Math.round(performance.now() - context.startedAt),
  };
}

// ClientRouterの初回表示・遷移完了ごとに一度呼ぶ。URLだけの更新は計算イベントで記録する。
export function trackPageView() {
  initialize();
  analytics.capture("$pageview", { $current_url: window.location.href });
  if (gaId)
    window.gtag?.("event", "page_view", {
      page_location: window.location.href,
      page_title: document.title,
    });
}
