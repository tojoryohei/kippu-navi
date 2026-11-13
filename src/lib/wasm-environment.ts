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

/** 既知の旧環境のCSP拒否だけを利用環境の案内に置き換える。元の例外はcauseに保持する。 */
export function normalizeWasmEnvironmentError(error: unknown, userAgent: string): unknown {
  const legacy = legacyWasmEnvironment(userAgent);
  const message = error instanceof Error ? error.message : "";
  const restricted = error instanceof Error && (error.name === "EvalError" || error.name === "CompileError")
    && /(?:unsafe-eval|content security policy|\bcsp\b|wasm.{0,30}(?:disallow|block)|webassembly.{0,30}(?:disallow|block))/i.test(message);
  if (!legacy || !restricted) return error;
  return Object.assign(new Error(legacy === "ios"
    ? "この端末で計算するにはiOS 16以降が必要です。iOSを更新してからご利用ください。"
    : "このブラウザでは計算機能を利用できません。Safari 16以降、Chrome 97以降、Firefox 102以降など、対応するブラウザでご利用ください。アプリ内で開いている場合は、端末の標準ブラウザで開き直してください。"), { name: "UnsupportedEnvironmentError", cause: error });
}

export async function checkWasmEnvironment(userAgent: string): Promise<void> {
  try {
    // (func (export "probe") (result i32) i32.const 1) を実体化し、関数本体まで実行する。
    // 本体と同じバイト列のinstantiate経路を使い、空モジュールのcompileだけで判定しない。
    const { instance } = await WebAssembly.instantiate(new Uint8Array([
      0, 97, 115, 109, 1, 0, 0, 0,
      1, 5, 1, 96, 0, 1, 127,
      3, 2, 1, 0,
      7, 9, 1, 5, 112, 114, 111, 98, 101, 0, 0,
      10, 6, 1, 4, 0, 65, 1, 11,
    ]).buffer);
    if ((instance.exports.probe as () => number)() !== 1) throw new Error("計算環境の確認用WASMが不正な値を返しました。");
  } catch (error) {
    throw normalizeWasmEnvironmentError(error, userAgent);
  }
}
