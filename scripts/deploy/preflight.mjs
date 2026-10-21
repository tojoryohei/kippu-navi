import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkLeaseEnv } from './admission.mjs';
import { decideApi, servingRevision, revisionCommit } from './policy.mjs';
import { config } from '../verification/config.mjs';

checkLeaseEnv();
const env = process.env;
const c = config(env.DEPLOY_ENVIRONMENT);
const report = { environment: c.environment, target: env.TARGET_SHA, lease: JSON.parse(env.DEPLOY_LEASE) };
function gcloud(args) {
  return JSON.parse(execFileSync('gcloud', [...args, '--project', c.project, '--region', c.region, '--format=json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
}
let baseline = null;
try {
  const service = gcloud(['run', 'services', 'describe', c.service]);
  report.revision = servingRevision(service);
  report.traffic = service.status?.traffic?.map(({ revisionName, percent }) => ({ revisionName, percent }));
  if (!report.revision) report.baselineFailure = 'traffic_not_single_observed_ready_revision';
  if (report.revision) baseline = revisionCommit(gcloud(['run', 'revisions', 'describe', report.revision]));
} catch { report.baselineFailure = 'cloud_run_state_unavailable'; }
const decision = decideApi({ baseline, target: env.TARGET_SHA });
const components = env.COMPONENTS;
if (!['auto', 'all', 'frontend', 'api'].includes(components)) throw new Error('不正な更新対象');
// フロントエンドのみの指定でも、APIの変更や基準不明を無視しない。
if (components === 'frontend' && decision.update) throw new Error(`API更新を省略できません: ${decision.reason}`);
const api = components !== 'frontend' && (components !== 'auto' || decision.update);
const frontend = components !== 'api';
let frontendSha = env.TARGET_SHA;
if (!frontend) {
  const response = await fetch(`${c.publicUrl}/deployment.json`, { signal: AbortSignal.timeout(35000), redirect: 'error' });
  const manifest = await response.json();
  if (response.status !== 200 || manifest.environment !== c.environment || !/^[a-f0-9]{40}$/.test(manifest.commit)) throw new Error('既存フロントエンドの基準SHAを確認できません');
  frontendSha = manifest.commit;
}
Object.assign(report, { api, frontend, decision, expectedFrontendSha: frontendSha, expectedApiSha: api ? env.TARGET_SHA : null });
mkdirSync('verification-results', { recursive: true });
writeFileSync('verification-results/preflight.json', JSON.stringify(report, null, 2));
for (const [key, value] of Object.entries({ api, frontend, frontend_sha: frontendSha, api_sha: api ? env.TARGET_SHA : '', baseline: baseline || '' })) appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
