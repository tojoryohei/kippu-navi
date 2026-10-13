export type ErrorDetail = { stage: string; asset?: string; name: string; message: string };
export function describeError(detail: ErrorDetail) {
  return [`処理: ${detail.stage}`, detail.asset ? `対象: ${detail.asset}` : '', `${detail.name}: ${detail.message}`].filter(Boolean).join('\n');
}
export type ReleaseStatus = { version: string; appVersion?: string; complete: boolean };
export function standalone() {
  return matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export function workerRequest<T>(worker: ServiceWorker, type: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('更新処理の状態を確認できませんでした。応答がありません。')); }, 10000);
    channel.port1.onmessage = event => {
      clearTimeout(timer);
      channel.port1.close();
      if (event.data?.ok === false && event.data.detail) reject(new Error(describeError(event.data.detail)));
      else resolve(event.data as T);
    };
    try { worker.postMessage({ type }, [channel.port2]); } catch (error) {
      clearTimeout(timer); channel.port1.close(); reject(error);
    }
  });
}
