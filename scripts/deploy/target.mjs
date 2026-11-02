import { resolveTarget as resolveStagingTarget } from '../staging/checks.mjs';
import { SHA } from './policy.mjs';

// 公開入口はmainの制御コードからの手動実行に統一する。
// ここでSHAを固定し、排他取得後のadmissionで先端・復旧実績を再検証する。
export async function resolveTarget(github, context, environment) {
  if (context.eventName !== 'workflow_dispatch' || context.ref !== 'refs/heads/main') {
    throw new Error('mainから手動で実行してください。');
  }
  if (environment === 'staging') return resolveStagingTarget(github, context);
  if (environment !== 'production') throw new Error('不正なデプロイ環境です。');

  const { mode, target_sha: sha = '', reason = '' } = context.payload.inputs ?? {};
  if (mode === 'restore') {
    if (!SHA.test(sha) || !reason.trim()) throw new Error('復旧には完全SHAと理由が必要です。');
    return { sha, branch: 'main' };
  }
  if (mode !== 'normal' || sha || reason) {
    throw new Error('通常公開はnormalを指定し、復旧用のSHAと理由を空欄にしてください。');
  }
  const { data: { object: { sha: main } } } = await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' });
  if (!SHA.test(main)) throw new Error('mainの完全SHAが必要です。');
  return { sha: main, branch: 'main' };
}
