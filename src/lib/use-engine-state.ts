import { useSyncExternalStore } from 'react';
import { isRetryableEngineError, SearchOperationError, type EngineCapability } from './search-errors';
import type { EngineClient } from './engine-client';
const noopSubscribe = () => () => {};
const preparing = () => 'preparing' as const;
export function useEngineState(client: EngineClient | null, capability: EngineCapability) {
  // プリミティブのスナップショットでuseSyncExternalStoreの比較を安定させる。
  const status = useSyncExternalStore(client ? listener => client.subscribe(listener) : noopSubscribe, () => {
    const state = client?.getState(capability);
    if (!state || state.status !== 'failed') return state?.status ?? 'preparing';
    return isRetryableEngineError(new SearchOperationError(state.error)) ? 'retryable' : 'failed';
  }, preparing);
  const error = useSyncExternalStore(client ? listener => client.subscribe(listener) : noopSubscribe, () => {
    const state = client?.getState(capability);
    return state?.status === 'failed' ? state.error : undefined;
  }, () => undefined);
  return { status, error };
}
