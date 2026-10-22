import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { checkLeaseEnv } from './admission.mjs';
import { decideApi, servingRevision, revisionCommit, planRelease } from './policy.mjs';
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
const plan = planRelease({ components: env.COMPONENTS, target: env.TARGET_SHA, decision });
Object.assign(report, plan);
const { api, frontend } = plan;
mkdirSync('verification-results', { recursive: true });
writeFileSync('verification-results/preflight.json', JSON.stringify(report, null, 2));
for (const [key, value] of Object.entries({ api, frontend, api_sha: api ? env.TARGET_SHA : '', baseline: baseline || '' })) appendFileSync(env.GITHUB_OUTPUT, `${key}=${value}\n`);
