import { execFileSync } from 'node:child_process';

export const SHA = /^[a-f0-9]{40}$/;
export function assertLease(lease, { runId, attempt, target, environment }) {
  if (!lease || !SHA.test(target) || lease.runId !== String(runId) || lease.attempt !== String(attempt)
      || lease.target !== target || lease.environment !== environment) {
    throw new Error('公開開始確認が現在のrun・attempt・対象SHA・環境と一致しません。統括から全ジョブを再実行してください。');
  }
}

export function servingRevision(service) {
  if (!Number.isSafeInteger(Number(service?.metadata?.generation)) || Number(service?.metadata?.generation) < 1
      || String(service?.status?.observedGeneration) !== String(service?.metadata?.generation)
      || !service?.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True')) return null;
  const traffic = service.status.traffic;
  if (!Array.isArray(traffic)) return null;
  const active = traffic.filter(t => Number(t.percent) > 0);
  if (!active.length || active.some(t => !t.revisionName || !Number.isInteger(t.percent))) return null;
  const names = new Set(active.map(t => t.revisionName));
  return names.size === 1 && active.reduce((n, t) => n + t.percent, 0) === 100 ? active[0].revisionName : null;
}

export function revisionCommit(revision) {
  if (!revision?.status?.conditions?.some(c => c.type === 'Ready' && c.status === 'True')) return null;
  const entries = revision.spec?.containers?.[0]?.env?.filter(e => e.name === 'DEPLOY_COMMIT') ?? [];
  return entries.length === 1 && !entries[0].valueFrom && SHA.test(entries[0].value) ? entries[0].value : null;
}

export function affectsApi(path) {
  return /^(calculation-engine\/|\.github\/workflows\/|scripts\/)/.test(path)
    || ['.dockerignore', '.node-version', '.npmrc', 'package.json', 'package-lock.json', 'wrangler.jsonc', 'astro.config.mjs', 'tsconfig.json'].includes(path);
}

export function decideApi({ baseline, target, diff = (base, head) => {
  // 履歴が浅い、または取得できない場合は公開を省略しない。
  if (execFileSync('git', ['rev-parse', '--is-shallow-repository'], { encoding: 'utf8' }).trim() !== 'false') throw new Error('Git履歴が浅いため更新を省略できません');
  for (const sha of [base, head]) execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { stdio: 'ignore' });
  return execFileSync('git', ['diff', '--name-only', '-z', base, head, '--'], { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).split('\0').filter(Boolean);
} }) {
  if (!SHA.test(baseline ?? '')) return { update: true, reason: 'serving_revision_sha_unknown' };
  try {
    const paths = diff(baseline, target);
    if (!Array.isArray(paths)) throw new Error('差分の形式が不正です');
    return { update: paths.some(affectsApi), reason: paths.some(affectsApi) ? 'api_or_shared_files_changed' : 'api_files_unchanged', baseline };
  } catch {
    return { update: true, reason: 'history_or_diff_unavailable', baseline };
  }
}

export function verifyRevision(service, revision, { target, image }) {
  const name = servingRevision(service);
  if (!name || revision.metadata?.name !== name || revisionCommit(revision) !== target) throw new Error('配信Revisionまたは比較用SHAが公開対象と一致しません');
  const digest = image.match(/@sha256:[a-f0-9]{64}$/)?.[0].slice(1);
  if (!digest || revision.status?.imageDigest !== image && revision.status?.imageDigest !== digest) throw new Error('配信Revisionのimage digestが公開対象と一致しません');
  return { revision: name, metadataCommit: target, image };
}

export function aggregate({ frontendUpdated, apiUpdated, jobs }) {
  const expected = { frontend: frontendUpdated ? 'success' : 'skipped', api: apiUpdated ? 'success' : 'skipped', direct: apiUpdated ? 'success' : 'skipped', public: 'success' };
  return { success: jobs.frontend === expected.frontend && jobs.api === expected.api && jobs.direct === expected.direct && jobs.public === expected.public, expected, actual: jobs,
    directReason: apiUpdated ? 'required_after_api_update' : 'not_applicable_api_unchanged' };
}
