import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { config } from './config.mjs';
import { verifyApi, verifyManifest, VerificationError, failureMessage } from './http.mjs';
import { serializeReport } from './report.mjs';
import { SHA } from '../deploy/policy.mjs';
const env = process.env;
const c = config(env.DEPLOY_ENVIRONMENT);
const direct = env.VERIFY_MODE === 'direct';
if (!['direct', 'public'].includes(env.VERIFY_MODE)) throw new Error('不正な検証モード');
if (direct && (!env.ID_TOKEN || !SHA.test(env.EXPECTED_API_SHA))) throw new Error('直接検証にはIDトークンと期待SHAが必要です');
const report = { mode: env.VERIFY_MODE, environment: c.environment, runId: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
  expectedFrontendSha: env.EXPECTED_FRONTEND_SHA ?? null, expectedApiSha: env.EXPECTED_API_SHA || null, checks: [], success: false };
const started = Date.now();
mkdirSync('verification-results', { recursive: true });
try {
  if (!direct) report.manifest = await verifyManifest(c.publicUrl, c.environment, env.EXPECTED_FRONTEND_SHA);
  await verifyApi({ base: direct ? c.serviceUrl : c.publicUrl, token: direct ? env.ID_TOKEN : undefined,
    expectedCommit: direct ? env.EXPECTED_API_SHA : undefined, record: row => report.checks.push(row) });
  report.success = true;
} catch (error) { report.error = failureMessage(error); if (error instanceof VerificationError) report.details = error.details; process.exitCode = 1; }
finally {
  report.elapsedMs = Date.now() - started;
  const serialized = serializeReport(report, [env.ID_TOKEN]);
  writeFileSync(`verification-results/${env.VERIFY_MODE}.json`, serialized);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, `### ${env.VERIFY_MODE} HTTP検証\n\n\`\`\`json\n${serialized}\n\`\`\`\n`);
}
