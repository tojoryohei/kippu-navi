import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregate, planRelease, assertLease, decideApi, servingRevision, revisionCommit, verifyRevision } from '../../scripts/deploy/policy.mjs';
import { admit } from '../../scripts/deploy/admission.mjs';
const sha = 'a'.repeat(40), old = 'b'.repeat(40);
function service(traffic = [{ revisionName: 'serving-old', percent: 100 }]) {
  return { metadata: { generation: '4' }, status: { observedGeneration: 4, conditions: [{ type: 'Ready', status: 'True' }], latestCreatedRevisionName: 'unpublished-new', latestReadyRevisionName: 'ready-but-unpublished', traffic } };
}
function revision(commit = sha) { return { metadata: { name: 'serving-old' }, spec: { containers: [{ env: [{ name: 'DEPLOY_COMMIT', value: commit }] }] }, status: { conditions: [{ type: 'Ready', status: 'True' }], imageDigest: `image@sha256:${'c'.repeat(64)}` } }; }
test('作成順ではなく実配信先を採用し、未確定・分割配信を拒否する', () => {
  assert.equal(servingRevision(service()), 'serving-old');
  assert.equal(servingRevision(service([{ revisionName: 'old', percent: 90 }, { revisionName: 'new', percent: 10 }])), null);
  assert.equal(servingRevision(service([{ revisionName: 'old', percent: 99 }])), null);
  assert.equal(servingRevision(service([{ latestRevision: true, percent: 100 }])), null);
  assert.equal(servingRevision(service([{ revisionName: 'old', percent: 100 }, { revisionName: 'tag-only', percent: 0 }])), 'old');
  const pending = service(); pending.status.observedGeneration = 3;
  assert.equal(servingRevision(pending), null);
  pending.status.observedGeneration = 4; pending.status.conditions[0].status = 'False';
  assert.equal(servingRevision(pending), null);
});
test('比較用メタデータと公開対象SHA・digestを照合する', () => {
  assert.equal(revisionCommit(revision()), sha);
  assert.equal(revisionCommit(revision('unknown')), null);
  const r = revision();
  assert.doesNotThrow(() => verifyRevision(service(), r, { target: sha, image: r.status.imageDigest }));
  assert.throws(() => verifyRevision(service(), r, { target: old, image: r.status.imageDigest }));
  assert.throws(() => verifyRevision(service(), r, { target: sha, image: `image@sha256:${'d'.repeat(64)}` }));
});
test('履歴や差分を確かめられなければAPI更新を省略しない', () => {
  for (const baseline of [null, '', 'local']) assert.equal(decideApi({ baseline, target: sha }).update, true);
  assert.equal(decideApi({ baseline: old, target: sha, diff: () => { throw new Error('shallow/missing/diff failed'); } }).update, true);
  assert.equal(decideApi({ baseline: old, target: sha, diff: () => ['src/pages/index.astro'] }).update, false);
  for (const path of ['calculation-engine/Dockerfile', '.github/workflows/test.yml', 'scripts/deploy/tools.json', 'scripts/shared.mjs', '.dockerignore', '.node-version', 'package.json', 'package-lock.json', 'wrangler.jsonc', 'astro.config.mjs']) {
    assert.equal(decideApi({ baseline: old, target: sha, diff: () => [path] }).update, true, path);
  }
  // ロールバック後もコミット順に依存せず、両SHAのツリー間を比較する。
  assert.equal(decideApi({ baseline: sha, target: old, diff: (base, head) => { assert.equal(base, sha); assert.equal(head, old); return ['calculation-engine/cmd/api/main.go']; } }).update, true);
});
const identity = { runId: '123', attempt: '1', target: sha, environment: 'production' };
test('古いrun・attempt・SHA・環境を拒否し、同じ実行中のmain更新を照合条件にしない', () => {
  assert.doesNotThrow(() => assertLease({ ...identity, mainAtStart: sha }, identity));
  for (const key of Object.keys(identity)) assert.throws(() => assertLease({ ...identity, [key]: 'stale' }, identity));
  assert.throws(() => assertLease(null, identity));
});
function fakeGithub({ main = sha, verified = true, runSuccess = true, payload = { verificationVersion: 1, target: old, runId: 4, attempt: 1 } } = {}) {
  return { rest: { git: { getRef: async params => { assert.equal(params.owner, 'o'); return { data: { object: { sha: main } } }; } }, repos: { compareCommits: async () => ({ data: { status: 'ahead' } }), listDeployments: 'deployments', listDeploymentStatuses: 'statuses' }, actions: { getWorkflowRunAttempt: async () => ({ data: { path: '.github/workflows/deploy-production.yml', head_branch: 'main', conclusion: runSuccess ? 'success' : 'failure' } }) } },
    paginate: async method => method === 'deployments' ? verified ? [{ id: 0, payload: null }, { id: 1, payload }] : [] : [{ state: 'inactive' }, { state: 'success' }] };
}
// 実際のGitHub Contextと同じく、repoはプロトタイプのgetterで供給する。
const context = Object.assign(Object.create({ get repo() { return { owner: 'o', repo: 'r' }; } }), { ref: 'refs/heads/main', runId: 123, runAttempt: 1, eventName: 'workflow_dispatch' });
test('通常公開は開始時のmain先頭だけを許可し、復旧は理由と正常公開記録が必要', async () => {
  const options = { github: fakeGithub(), context, environment: 'production', target: sha, mode: 'normal', components: 'all' };
  const lease = await admit(options);
  assert.equal(lease.mainAtStart, sha);
  await assert.rejects(admit({ ...options, target: old }), /古い通常公開/);
  for (const extra of [{ reason: '' }, { components: 'api' }, { github: fakeGithub({ verified: false }) }, { github: fakeGithub({ runSuccess: false }) }]) {
    await assert.rejects(admit({ ...options, target: old, mode: 'restore', reason: 'rollback', ...extra }));
  }
  assert.equal((await admit({ ...options, target: old, mode: 'restore', reason: 'rollback' })).mode, 'restore');
});
test('3更新パターンを集計し、必須公開・直接検証の失敗と予期しないskipを拒否する', () => {
  const jobs = { frontend: 'success', api: 'success', direct: 'success' };
  assert.equal(aggregate({ frontendUpdated: true, apiUpdated: true, jobs }).success, true);
  for (const job of Object.keys(jobs)) for (const outcome of ['failure', 'skipped', 'cancelled']) {
    assert.equal(aggregate({ frontendUpdated: true, apiUpdated: true, jobs: { ...jobs, [job]: outcome } }).success, false);
  }
  const frontOnly = aggregate({ frontendUpdated: true, apiUpdated: false, jobs: { ...jobs, api: 'skipped', direct: 'skipped' } });
  assert.equal(frontOnly.success, true);
  assert.equal(frontOnly.directReason, 'not_applicable_api_unchanged');
  assert.equal(aggregate({ frontendUpdated: true, apiUpdated: false, jobs }).success, false);
  assert.equal(aggregate({ frontendUpdated: false, apiUpdated: true, jobs: { ...jobs, frontend: 'skipped' } }).success, true);
});

test('v2の復旧根拠は両サービス更新と直接検証の成功記録だけを許可する', async () => {
  const payload = { verificationVersion: 2, target: old, runId: 4, attempt: 1, frontendUpdated: true, apiUpdated: true, directVerified: true, publicPathVerified: false };
  const options = { context, environment: 'production', target: old, mode: 'restore', reason: '復旧', components: 'all' };
  await admit({ ...options, github: fakeGithub({ payload }) });
  for (const field of ['frontendUpdated', 'apiUpdated', 'directVerified']) {
    for (const value of [false, undefined, 'true']) await assert.rejects(admit({ ...options, github: fakeGithub({ payload: { ...payload, [field]: value } }) }), /正常公開記録/);
  }
  await assert.rejects(admit({ ...options, github: fakeGithub({ payload: { ...payload, verificationVersion: 3 } }) }), /正常公開記録/);
});

test('APIのみでは公開manifestや既存フロントエンドSHAを要求しない', () => {
  const plan = planRelease({ components: 'api', target: sha, decision: { update: true } });
  assert.equal(plan.api, true);
  assert.equal(plan.frontend, false);
  assert.equal(plan.expectedFrontendArtifactSha, null);
  assert.equal(plan.frontendVerification, 'not_applicable_frontend_unchanged');
  assert.equal(plan.publicPathVerified, false);
  assert.equal(plan.expectedApiSha, sha);
  const frontend = planRelease({ components: 'frontend', target: sha, decision: { update: false } });
  assert.equal(frontend.expectedFrontendArtifactSha, sha);
  assert.equal(frontend.expectedApiSha, null);
  assert.throws(() => planRelease({ components: 'frontend', target: sha, decision: { update: true, reason: 'unknown' } }), /省略できません/);
});
