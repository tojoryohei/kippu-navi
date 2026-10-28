import type { ExceptionDiagnostics, ResourceAttempt, SearchDiagnostics } from "./search-errors";

function field(value: unknown, key: string): unknown {
  try { return value != null ? (Object(value) as Record<string, unknown>)[key] : undefined; }
  catch { return undefined; }
}

function text(value: unknown, limit: number): string | undefined {
  return typeof value === "string" && value.length > 0 ? value.slice(0, limit) : undefined;
}

export function exceptionDiagnostics(error: unknown, event?: unknown): ExceptionDiagnostics {
  const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
  return {
    message: text(field(error, "message"), 1_000) || text(field(event, "message"), 1_000) || text(error, 1_000),
    name: text(field(error, "name"), 100),
    stack: text(field(error, "stack"), 8_000),
    filename: text(field(event, "filename"), 8_000) || text(field(error, "filename"), 8_000) || text(field(error, "fileName"), 8_000),
    line: number(field(event, "lineno")) || number(field(error, "line")) || number(field(error, "lineNumber")),
    column: number(field(event, "colno")) || number(field(error, "column")) || number(field(error, "columnNumber")),
  };
}

// 上限は全資材の再試行・フォールバックを含む初期化1回分を保持できる件数。
export function appendResource(history: ResourceAttempt[], attempt: ResourceAttempt) {
  history.push(attempt);
  if (history.length > 32) history.shift();
}

export function copyDiagnostics(diagnostics?: SearchDiagnostics): SearchDiagnostics | undefined {
  if (!diagnostics) return undefined;
  return {
    ...diagnostics,
    exception: diagnostics.exception && exceptionDiagnostics(diagnostics.exception),
    resources: diagnostics.resources?.slice(-32).map(resource => ({ ...resource, exception: resource.exception && exceptionDiagnostics(resource.exception) })),
    // 再起動は1回まで。再帰的な履歴を作らず、各試行の診断を保存する。
    attempts: diagnostics.attempts?.slice(0, 2).map(attempt => ({ ...attempt, diagnostics: copyDiagnostics({ ...attempt.diagnostics, attempts: undefined }) })),
  };
}
