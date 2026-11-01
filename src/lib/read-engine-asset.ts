/** ヘッダー待機・本文の無通信だけを制限し、受信中の取得は継続する。 */
export async function readEngineAsset(
  url: string,
  onProgress: (receivedBytes: number) => void,
  idleMs = 30_000,
): Promise<{ buffer: ArrayBuffer; status: number }> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  let receivedBytes = 0;
  let timedOut = false;
  const refresh = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; controller.abort(); }, idleMs);
  };
  refresh();
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw Object.assign(new Error(`${url}: ${response.status} ${response.statusText}`), { httpStatus: response.status });
    refresh();
    reader = response.body?.getReader();
    if (!reader) throw new Error('エンジン資材の本文を取得できませんでした。');
    const chunks: Uint8Array[] = [];
    let lastNotification = -Infinity;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value.byteLength) continue;
      chunks.push(value);
      receivedBytes += value.byteLength;
      refresh();
      if (performance.now() - lastNotification >= 1000) {
        lastNotification = performance.now();
        onProgress(receivedBytes);
      }
    }
    const buffer = new Uint8Array(receivedBytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    return { buffer: buffer.buffer, status: response.status };
  } catch (error) {
    throw Object.assign(error instanceof Error ? error : new Error(String(error)), {
      receivedBytes, timedOut, abortReason: timedOut ? 'network_idle' : undefined,
    });
  } finally {
    clearTimeout(timer!);
    reader?.releaseLock();
  }
}
