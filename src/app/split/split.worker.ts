/// <reference lib="webworker" />
import type { SearchDiagnostics } from "@/lib/search-errors";

const startedAt = performance.now();
let stage: SearchDiagnostics["workerBootstrapStage"] = "environment_import";
function progress(workerBootstrapStage: SearchDiagnostics["workerBootstrapStage"]) {
  stage = workerBootstrapStage;
  postMessage({ type: "initialization_progress", diagnostics: { workerBootstrapStage, workerLocation: self.location.href } });
}
// 起動前の静的import失敗はonerrorに元例外が渡らないため、依存の評価をcatch内に置く。
progress("environment_import");
void import("../../lib/wasm-environment").then(async ({ checkWasmEnvironment }) => {
  progress("environment_check");
  await checkWasmEnvironment(navigator.userAgent);
  progress("module_import");
  postMessage({ type: "environment_supported" });
  return import("./split-engine");
}).then(() => {
  progress("module_ready");
}).catch((error: unknown) => {
  const exception = error instanceof Error ? { name: error.name, message: error.message.slice(0, 1_000), stack: error.stack?.slice(0, 8_000) } : { message: String(error).slice(0, 1_000) };
  // 取得済み資材を再取得せず、ブラウザが観測した通信結果だけを保持する。
  let moduleResources: SearchDiagnostics["moduleResources"];
  try {
    moduleResources = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter(entry => new URL(entry.name).origin === self.location.origin)
      .slice(-16).map(entry => ({ url: entry.name, initiatorType: entry.initiatorType,
        durationMs: Math.round(entry.duration), transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize, status: entry.responseStatus || undefined }));
  } catch { /* 通信計測が使えない環境でも元の例外を通知する。 */ }
  const checkingEnvironment = stage === "environment_check";
  postMessage({
    type: "initialization_error", error: exception.message, errorCode: exception.name === "UnsupportedEnvironmentError" ? "unsupported_environment" : checkingEnvironment ? "wasm_instantiation_failed" : "worker_runtime_failed",
    errorStage: checkingEnvironment ? "wasm_instantiate" : "worker_bootstrap", exceptionName: exception.name || "Error", retryable: exception.name !== "UnsupportedEnvironmentError",
    diagnostics: { workerBootstrapStage: stage, moduleResources, workerLocation: self.location.href, workerElapsedMs: Math.round(performance.now() - startedAt), exception },
  });
});
