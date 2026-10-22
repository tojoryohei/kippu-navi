import { SHA, assertLease } from './policy.mjs';

export async function admit({ github, context, target, environment, mode, reason = '', components }) {
  if (!SHA.test(target) || context.ref !== 'refs/heads/main') throw new Error('mainの制御コードと完全SHAが必要です');
  const main = (await github.rest.git.getRef({ ...context.repo, ref: 'heads/main' })).data.object.sha;
  if (environment === 'production') {
    if (mode === 'normal') {
      if (target !== main) throw new Error('古い通常公開を拒否しました。対象SHAは公開開始時のmain先頭と一致する必要があります');
    } else if (mode === 'restore') {
      if (context.eventName !== 'workflow_dispatch' || !reason.trim() || components !== 'all') throw new Error('復旧には手動起動・理由・両サービス更新が必要です');
      const comparison = (await github.rest.repos.compareCommits({ ...context.repo, base: target, head: main })).data;
      if (!['ahead', 'identical'].includes(comparison.status)) throw new Error('復旧対象がmain履歴上にありません');
      const deployments = await github.paginate(github.rest.repos.listDeployments, { ...context.repo, sha: target, environment: 'production', per_page: 100 });
      let verified = false;
      for (const deployment of deployments) {
        const payload = deployment.payload && typeof deployment.payload === 'object' ? deployment.payload : {};
        const eligible = payload.verificationVersion === 1 || payload.verificationVersion === 2
          && payload.frontendUpdated === true && payload.apiUpdated === true && payload.directVerified === true && payload.publicPathVerified === false;
        if (!eligible || payload.target !== target || !Number.isSafeInteger(Number(payload.runId)) || Number(payload.runId) < 1 || !Number.isSafeInteger(Number(payload.attempt)) || Number(payload.attempt) < 1) continue;
        const run = (await github.rest.actions.getWorkflowRunAttempt({ ...context.repo, run_id: payload.runId, attempt_number: Number(payload.attempt) })).data;
        const statuses = await github.paginate(github.rest.repos.listDeploymentStatuses, { ...context.repo, deployment_id: deployment.id, per_page: 100 });
        if (run.path === '.github/workflows/deploy-production.yml' && run.head_branch === 'main' && run.conclusion === 'success'
            && statuses.some(status => status.state === 'success')) { verified = true; break; }
      }
      if (!verified) throw new Error('検証導入後の本番正常公開記録がありません');
    } else throw new Error('不正な公開モード');
  } else if (environment !== 'staging' || mode !== 'normal') throw new Error('不正な環境・公開モード');
  return { runId: String(context.runId), attempt: String(context.runAttempt ?? process.env.GITHUB_RUN_ATTEMPT), target, environment, mode, mainAtStart: main, reason };
}

export function checkLeaseEnv(env = process.env) {
  assertLease(JSON.parse(env.DEPLOY_LEASE || 'null'), { runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, target: env.TARGET_SHA, environment: env.DEPLOY_ENVIRONMENT });
}
