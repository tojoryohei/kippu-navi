import * as Sentry from "@sentry/browser";
import posthog from "posthog-js";
import type { EngineReadiness } from "@/lib/engine-client";
import { buildSearchCompletedProperties, type SearchOutcome } from "@/lib/analytics-events";
import { SearchOperationError, type EngineCapability } from "@/lib/search-errors";

const posthogKey = import.meta.env.PUBLIC_POSTHOG_KEY;
const sentryDsn = import.meta.env.PUBLIC_SENTRY_DSN;
let initialized = false;

function releaseProperties() {
  return { engine_version: __WASM_VERSION__, app_version: __APP_VERSION__, deploy_commit: __DEPLOY_COMMIT__, environment: __DEPLOY_ENVIRONMENT__ };
}

function initialize() {
  if (initialized || typeof window === "undefined") return;
  initialized = true;
  if (posthogKey) {
    posthog.init(posthogKey, { api_host: "/ingest", ui_host: "https://us.posthog.com", person_profiles: "never", capture_pageview: false, disable_session_recording: true, autocapture: false, capture_performance: false });
  }
  if (sentryDsn) {
    Sentry.init({
      dsn: sentryDsn,
      tunnel: "/monitoring",
      environment: __DEPLOY_ENVIRONMENT__,
      release: `${__APP_VERSION__}+${__DEPLOY_COMMIT__}`,
      sendDefaultPii: false,
      sendClientReports: false,
      tracesSampleRate: 0,
      integrations(defaultIntegrations) {
        return defaultIntegrations.filter(integration => integration.name !== "BrowserSession");
      },
      beforeSend(event) {
        delete event.user;
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
          delete event.request.data;
        }
        return event;
      },
    });
  }
}

export const analytics = {
  capture(event: string, properties?: Record<string, unknown>) {
    initialize();
    if (posthogKey) posthog.capture(event, { ...releaseProperties(), $current_url: window.location.pathname, ...properties });
  },
};

const DUPLICATE_ROUTE_ERROR = "経路が重複しています。";
const BUSINESS_ERROR_CODES = new Set(["duplicate_route", "path_invalid"]);

export function getCalculationErrorType(error: string) {
  return error === DUPLICATE_ROUTE_ERROR ? "duplicate_route" : "calculation_error";
}

export interface SearchEventContext {
  searchId: string;
  startedAt: number;
  capability: EngineCapability;
  searchType: string;
  calculationMode?: string;
  readiness?: EngineReadiness;
  requestId?: string;
}

export function createSearchId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function normalizeSearchError(error: unknown, capability: EngineCapability): SearchOperationError {
  if (error instanceof SearchOperationError) return error;
  const exception = error instanceof Error ? error : new Error(String(error));
  const duplicate = exception.message === DUPLICATE_ROUTE_ERROR;
  return new SearchOperationError({ message: exception.message, code: duplicate ? "duplicate_route" : "calculation_failed", source: "client", stage: "calculation", exceptionName: exception.name, capability, retryable: false, retryCount: 0, workerRestartCount: 0 });
}

function completedSearchProperties(context: SearchEventContext, outcome: SearchOutcome, errorCode?: string) {
  return buildSearchCompletedProperties({
    searchType: context.searchType,
    calculationMode: context.calculationMode,
    capability: context.capability,
    elapsedMs: Math.round(performance.now() - context.startedAt),
    engineRecovered: Boolean(context.readiness?.recovered),
    retryCount: context.readiness?.retryCount || 0,
    workerRestartCount: context.readiness?.workerRestartCount || 0,
    outcome,
    errorCode,
  });
}

export function captureSearchError(error: unknown, context: SearchEventContext) {
  const normalized = normalizeSearchError(error, context.capability);
  const details = normalized.details;
  const businessError = BUSINESS_ERROR_CODES.has(details.code);
  analytics.capture("search_completed", completedSearchProperties(context, businessError ? "business_error" : "system_error", details.code));

  if (!businessError) {
    initialize();
    if (sentryDsn) {
      Sentry.withScope(scope => {
        scope.setTags({ error_code: details.code, error_stage: details.stage, capability: details.capability || context.capability, http_status: details.httpStatus?.toString() || "none", retry_count: details.retryCount.toString(), app_version: __APP_VERSION__, engine_version: __WASM_VERSION__, deploy_commit: __DEPLOY_COMMIT__ });
        if (context.requestId) scope.setTag("request_id", context.requestId);
        scope.setExtra("search_url", window.location.href);
        scope.setFingerprint([details.code, details.stage, details.capability || context.capability, String(details.httpStatus || "none"), __WASM_VERSION__]);
        Sentry.captureException(normalized);
      });
    }
  }
  return normalized;
}

export function captureEngineRecovery(readiness: EngineReadiness, context: SearchEventContext) {
  context.readiness = readiness;
}

export function captureSuccessfulSearch(context: SearchEventContext) {
  analytics.capture("search_completed", completedSearchProperties(context, "success"));
}

export function captureUnhandledError(error: unknown, component: string) {
  initialize();
  if (!sentryDsn) return;
  Sentry.withScope(scope => {
    scope.setTag("component", component);
    scope.setTags(releaseProperties());
    Sentry.captureException(error);
  });
}

// ClientRouterの初回表示・遷移完了ごとに一度呼ぶ。検索条件は送信しない。
export function trackPageView() {
  initialize();
  analytics.capture("$pageview", { $current_url: window.location.pathname });
}
