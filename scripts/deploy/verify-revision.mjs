import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { checkLeaseEnv } from './admission.mjs';
import { servingRevision, verifyRevision } from './policy.mjs';
import { config } from '../verification/config.mjs';
checkLeaseEnv();
const c = config(process.env.DEPLOY_ENVIRONMENT);
const read = args => JSON.parse(execFileSync('gcloud', [...args, '--project', c.project, '--region', c.region, '--format=json'], { encoding: 'utf8' }));
const started = Date.now();
const report = { expectedCommit: process.env.TARGET_SHA, expectedImage: process.env.PUBLISHED_IMAGE, success: false };
mkdirSync('verification-results', { recursive: true });
try {
  const service = read(['run', 'services', 'describe', c.service]);
  const revision = servingRevision(service);
  if (!revision) throw new Error('配信Revisionが単一100%・Ready状態ではありません');
  const data = read(['run', 'revisions', 'describe', revision]);
  report.actualRevision = revision;
  report.actualImage = data.status?.imageDigest;
  report.actualCommit = data.spec?.containers?.[0]?.env?.find(e => e.name === 'DEPLOY_COMMIT')?.value;
  Object.assign(report, verifyRevision(service, data, { target: process.env.TARGET_SHA, image: process.env.PUBLISHED_IMAGE }), { success: true });
} catch (error) { report.error = error.message; process.exitCode = 1; }
finally {
  report.elapsedMs = Date.now() - started;
  const serialized = JSON.stringify(report, null, 2);
  writeFileSync('verification-results/revision.json', serialized);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Cloud Run配信Revision照合\n\n\`\`\`json\n${serialized}\n\`\`\`\n`);
}
