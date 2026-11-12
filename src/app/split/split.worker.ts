/// <reference lib="webworker" />
import type { SearchDiagnostics } from "@/lib/search-errors";

import { checkWasmEnvironment } from "../../lib/wasm-environment";

const startedAt = performance.now();
let environmentChecked = false;
function progress(workerBootstrapStage: SearchDiagnostics["workerBootstrapStage"]) {
  postMessage({ type: "initialization_progress", diagnostics: { workerBootstrapStage, workerLocation: self.location.href } });
}
progress("module_import");
void checkWasmEnvironment(navigator.userAgent).then(() => {
  environmentChecked = true;
  postMessage({ type: "environment_supported" });
  return import("./split-engine");
}).then(() => {
  progress("module_ready");
}).catch((error: unknown) => {
  const exception = error instanceof Error ? { name: error.name, message: error.message.slice(0, 1_000), stack: error.stack?.slice(0, 8_000) } : { message: String(error).slice(0, 1_000) };
  postMessage({
    type: "initialization_error", error: exception.message, errorCode: exception.name === "UnsupportedEnvironmentError" ? "unsupported_environment" : environmentChecked ? "worker_runtime_failed" : "wasm_instantiation_failed",
    errorStage: environmentChecked ? "worker_bootstrap" : "wasm_instantiate", exceptionName: exception.name || "Error", retryable: exception.name !== "UnsupportedEnvironmentError",
    diagnostics: { workerLocation: self.location.href, workerElapsedMs: Math.round(performance.now() - startedAt), exception },
  });
});
