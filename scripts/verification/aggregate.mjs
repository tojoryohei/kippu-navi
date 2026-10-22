import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { aggregate } from '../deploy/policy.mjs';
import { checkLeaseEnv } from '../deploy/admission.mjs';
const needs = JSON.parse(process.env.JOB_RESULTS);
const result = aggregate({ frontendUpdated: needs.preflight.outputs.frontend === 'true', apiUpdated: needs.preflight.outputs.api === 'true',
  jobs: { frontend: needs.frontend.result, api: needs.api.result, direct: needs.direct.result } });
Object.assign(result, { runId: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, target: process.env.TARGET_SHA,
  environment: process.env.DEPLOY_ENVIRONMENT, frontendArtifactSha: needs.frontend.result === 'success' ? process.env.TARGET_SHA : null,
  frontendVerification: needs.preflight.outputs.frontend === 'true' ? (needs.frontend.result === 'success' ? 'artifact_only' : 'artifact_failed_or_unverified') : 'not_applicable_frontend_unchanged', publicPathVerified: false,
  expectedApiSha: needs.preflight.outputs.api_sha || null, reason: process.env.RESTORE_REASON || null });
try { checkLeaseEnv(); if (needs.preflight.result !== 'success') throw new Error('公開開始確認に失敗しました'); }
catch (error) { result.success = false; result.error = error.message; }
mkdirSync('verification-results', { recursive: true });
writeFileSync('verification-results/result.json', JSON.stringify(result, null, 2));
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## デプロイ後検証\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n\nAPI更新時はCloud Runの固定3ケースを直接検証します。フロントエンドSHAは公開artifactの確認のみです。公開サイト・Cloudflare接続・公開WASM・画面上の計算結果・全経路の計算正確性は保証対象外です。\n`);
if (!result.success) process.exitCode = 1;
