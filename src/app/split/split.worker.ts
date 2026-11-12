/// <reference lib="webworker" />
import type { SearchDiagnostics } from "@/lib/search-errors";

const startedAt = performance.now();
function progress(workerBootstrapStage: SearchDiagnostics["workerBootstrapStage"]) {
  postMessage({ type: "initialization_progress", diagnostics: { workerBootstrapStage, workerLocation: self.location.href } });
}
progress("module_import");
void import("./split-engine").then(() => {
  progress("module_ready");
}).catch((error: unknown) => {
  const exception = error instanceof Error ? { name: error.name, message: error.message.slice(0, 1_000), stack: error.stack?.slice(0, 8_000) } : { message: String(error).slice(0, 1_000) };
  postMessage({
    type: "initialization_error", error: exception.message, errorCode: "worker_runtime_failed",
    errorStage: "worker_bootstrap", exceptionName: exception.name || "Error", retryable: true,
    diagnostics: { workerLocation: self.location.href, workerElapsedMs: Math.round(performance.now() - startedAt), exception },
  });
});
