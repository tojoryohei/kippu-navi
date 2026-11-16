import type { SearchErrorDetails } from './search-errors';

const PREFIX = 'worker-reload-pending:';
const MAX_AGE_MS = 30 * 60_000;
export interface EngineReloadRecovery {
  failureId?: string;
  startedAt: number;
  url: string;
  workerUrl?: string;
}

/** 入力保存後のURLと元障害を、同じタブのリロード先へ引き継ぐ。 */
export function saveEngineReload(error: SearchErrorDetails) {
  const recovery: EngineReloadRecovery = {
    failureId: error.failureId, startedAt: Date.now(),
    url: location.pathname + location.search,
    workerUrl: error.diagnostics?.workerUrl,
  };
  sessionStorage.setItem(PREFIX + location.pathname, JSON.stringify(recovery));
}

export function readEngineReload(consume = false): EngineReloadRecovery | undefined {
  try {
    const key = PREFIX + location.pathname;
    const raw = sessionStorage.getItem(key);
    if (!raw) return;
    const value = JSON.parse(raw) as EngineReloadRecovery;
    const age = Date.now() - value.startedAt;
    if (!Number.isFinite(age) || age < 0 || age > MAX_AGE_MS) {
      sessionStorage.removeItem(key);
      return;
    }
    // 別条件の検索成功を、元の検索の回復成功と数えない。
    if (value.url !== location.pathname + location.search) return;
    if (consume) sessionStorage.removeItem(key);
    return value;
  } catch { return undefined; }
}
