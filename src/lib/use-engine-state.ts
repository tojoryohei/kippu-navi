import { useEffect, useSyncExternalStore } from 'react';
import { isRetryableEngineError, SearchOperationError, type EngineCapability, type SearchErrorDetails } from './search-errors';
import type { EngineClient } from './engine-client';
const noopSubscribe = () => () => {};
const preparing = () => 'preparing' as const;
export function useEngineState(client: EngineClient | null, capability: EngineCapability, environmentOnly = false) {
  // プリミティブのスナップショットでuseSyncExternalStoreの比較を安定させる。
  const status = useSyncExternalStore(client ? listener => client.subscribe(listener) : noopSubscribe, () => {
    const state = client?.getState(capability);
    if (!state || state.status !== 'failed') return environmentOnly && state?.status === 'preparing' && state.environmentSupported ? 'ready' : state?.status ?? 'preparing';
    if (state.error.code === 'unsupported_environment') return 'unsupported';
    return isRetryableEngineError(new SearchOperationError(state.error)) ? 'retryable' : 'failed';
  }, preparing);
  const error = useSyncExternalStore(client ? listener => client.subscribe(listener) : noopSubscribe, () => {
    const state = client?.getState(capability);
    return state?.status === 'failed' ? state.error : undefined;
  }, () => undefined);
  return { status, error };
}

/** 同じ画面での自動更新はタブごとに1回まで。保存できない環境ではループを避ける。 */
export function useEngineReload(error: SearchErrorDetails | undefined, saveInputs: () => void) {
  useEffect(() => {
    if (error?.recoveryAction !== 'reload') return;
    try {
      const key = `worker-reload:${location.pathname}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
      saveInputs();
      location.reload();
    } catch { /* 保存できない場合は案内文を表示する。 */ }
  }, [error, saveInputs]);
}
