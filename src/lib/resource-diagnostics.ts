import { appendResource, exceptionDiagnostics } from "@/lib/error-diagnostics";
import type { ResourceAttempt, SearchDiagnostics } from "./search-errors";

export function createResourceDiagnostics(onChange?: (diagnostics: SearchDiagnostics) => void) {
  const resources: ResourceAttempt[] = [];
  const phases: NonNullable<SearchDiagnostics["phases"]> = {};
  const startedAt = performance.now();
  function snapshot(): SearchDiagnostics {
    return { resources: resources.map(resource => ({ ...resource })), phases: { ...phases } };
  }
  function phase(scope: string, phase: string, state: "started" | "completed") {
    phases[scope] = { phase, state, elapsedMs: Math.round(performance.now() - startedAt) };
    onChange?.(snapshot());
  }
  async function measure<T>(url: string, operation: string, attempt: number, run: () => Promise<T>, options: { receivedBytes?: () => number; fallbackFrom?: string; timedOut?: () => boolean; status?: () => number | undefined } = {}): Promise<T> {
    const start = performance.now();
    phase(url, operation, "started");
    try {
      const value = await run();
      const status = options.status?.();
      appendResource(resources, { url, phase: operation, attempt, outcome: status !== undefined && status >= 400 ? "failure" : "success", elapsedMs: Math.round(performance.now() - start), status, receivedBytes: options.receivedBytes?.(), fallbackFrom: options.fallbackFrom });
      phase(url, operation, "completed");
      return value;
    } catch (error) {
      appendResource(resources, { url, phase: operation, attempt, outcome: "failure", elapsedMs: Math.round(performance.now() - start), status: options.status?.() ?? (error as { httpStatus?: number })?.httpStatus, timedOut: options.timedOut?.() ?? (error as { timedOut?: boolean })?.timedOut, receivedBytes: (error as { receivedBytes?: number })?.receivedBytes, abortReason: (error as { abortReason?: "network_idle" })?.abortReason, exception: exceptionDiagnostics(error), fallbackFrom: options.fallbackFrom });
      onChange?.(snapshot());
      throw error;
    }
  }
  return { snapshot, phase, measure };
}
