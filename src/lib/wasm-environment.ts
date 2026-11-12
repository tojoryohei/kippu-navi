// UAは実行拒否の分類にだけ使い、実行できる旧ブラウザは制限しない。
function legacyWasmEnvironment(userAgent: string): "ios" | "browser" | undefined {
  const ios = /(?:iPhone|iPad|iPod).*OS (\d+)[_\d]*/.exec(userAgent);
  if (ios) return Number(ios[1]) < 16 ? "ios" : undefined;
  const chromium = /(?:Chrome|Chromium)\/(\d+)/.exec(userAgent);
  if (chromium) return Number(chromium[1]) < 97 ? "browser" : undefined;
  const firefox = /Firefox\/(\d+)/.exec(userAgent);
  if (firefox) return Number(firefox[1]) < 102 ? "browser" : undefined;
  const safari = /Version\/(\d+).*Safari\//.exec(userAgent);
  if (safari && /AppleWebKit\//.test(userAgent)) return Number(safari[1]) < 16 ? "browser" : undefined;
  return undefined;
}

export async function checkWasmEnvironment(userAgent: string): Promise<void> {
  try {
    // 空の有効なWASMモジュール。同じWorkerに適用されるCSPでコンパイルする。
    await WebAssembly.compile(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
  } catch (error) {
    const legacy = legacyWasmEnvironment(userAgent);
    const message = error instanceof Error ? error.message : "";
    const restricted = error instanceof Error && (error.name === "EvalError" || error.name === "CompileError")
      && /(?:unsafe-eval|content security policy|\bcsp\b|wasm.{0,30}(?:disallow|block)|webassembly.{0,30}(?:disallow|block))/i.test(message);
    if (legacy && restricted) {
      throw Object.assign(new Error(legacy === "ios"
        ? "この端末で計算するにはiOS 16以降が必要です。iOSを更新してからご利用ください。"
        : "このブラウザでは計算機能を利用できません。Safari 16以降、Chrome 97以降、Firefox 102以降など、対応するブラウザでご利用ください。アプリ内で開いている場合は、端末の標準ブラウザで開き直してください。"), { name: "UnsupportedEnvironmentError", cause: error });
    }
    throw error;
  }
}
