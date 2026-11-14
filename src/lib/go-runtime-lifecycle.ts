import type { SearchDiagnostics } from './search-errors';

interface Runtime {
  exit(code: number): void;
  run(instance: WebAssembly.Instance): Promise<void>;
}
interface RuntimeOutput {
  writeSync(fd: number, buffer: Uint8Array): number;
}

/** Goは常駐するため、正常コードを含む終了もWorker全体の障害として通知する。 */
export function monitorGoRuntime(runtime: Runtime, output: RuntimeOutput, failed: (error: unknown, diagnostic: NonNullable<SearchDiagnostics['goRuntime']>) => void) {
  let ended = false;
  let stderr = '';
  const decoder = new TextDecoder();
  const write = output.writeSync;
  const exit = runtime.exit;
  const report = (error: unknown, exitCode?: number) => {
    if (ended) return;
    ended = true;
    failed(error, { exitCode, stderr });
  };
  output.writeSync = function(fd, buffer) {
    // 通常の標準出力は収集せず、panicを含む標準エラーの先頭と末尾だけ保持する。
    if (fd === 2) {
      stderr += decoder.decode(buffer, { stream: true });
      if (stderr.length > 8_000) stderr = stderr.slice(0, 4_000) + stderr.slice(-4_000);
    }
    return write.call(this, fd, buffer);
  };
  runtime.exit = code => {
    report(new Error(`Goの実行が終了しました（終了コード: ${code}）。`), code);
    exit.call(runtime, code);
  };
  return {
    run(instance: WebAssembly.Instance) {
      try {
        void runtime.run(instance).then(
          () => report(new Error('Goの実行が予期せず終了しました。')),
          error => report(error),
        );
      } catch (error) { report(error); }
    },
    fail(error: unknown) { report(error); },
  };
}
