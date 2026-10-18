import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyStaging, verifyWithRetry } from '../../scripts/staging/verify.mjs';
import { assertCurrentTarget, resolveTarget, publishResult } from '../../scripts/staging/checks.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const target = { sha, branch: 'renovate/test' };
const repo = { owner: 'owner', repo: 'repo' };
const manifest = { environment: 'staging', commit: sha, enginePath: `/engine/${'c'.repeat(64)}` };
function fakeFetch(overrides = {}) {
  let manifests = 0;
  return async url => {
    if (url.pathname === '/deployment.json') {
      manifests++;
      return Response.json({ ...manifest, ...(overrides.frontend || {}), ...(manifests > 1 ? overrides.after : {}) });
    }
    if (url.pathname === '/') return new Response('<html><script src="/_astro/app.js"></script></html>', { headers: { 'Content-Type': 'text/html' } });
    if (url.pathname.startsWith('/api/')) return Response.json(overrides.body || { normal: ['東京', '品川'], results: [['東京', '品川']] }, {
      status: overrides.status || 200, headers: { 'X-Deployment-Commit': overrides.apiSha || sha },
    });
    return new Response(overrides.emptyAsset ? '' : 'asset');
  };
}

test('smoke checks both services and all search APIs', async () => {
  const urls = [];
  const fake = fakeFetch();
  await verifyStaging({ sha, fetchImpl: url => { urls.push(url.pathname); return fake(url); } });
  assert.equal(urls.filter(url => url === '/deployment.json').length, 2);
  for (const api of ['split-pass', 'split-icpass', 'split-ticket']) assert.ok(urls.includes(`/api/${api}`));
});
for (const [name, overrides] of Object.entries({
  'stale frontend': { frontend: { commit: other } },
  'stale API': { apiSha: other },
  'frontend changed mid-test': { after: { commit: other } },
  'API error': { status: 500 },
  'empty results': { body: { normal: ['東京', '品川'], results: [] } },
  'invalid result path': { body: { normal: ['東京', '品川'], results: [['東京']] } },
  'missing assets': { emptyAsset: true },
})) {
  test(`reject ${name}`, async () => {
    await assert.rejects(verifyStaging({ sha, fetchImpl: fakeFetch(overrides) }));
  });
}
test('network failures have a bounded retry budget', async () => {
  let attempts = 0;
  let sleeps = 0;
  await assert.rejects(verifyWithRetry({ sha, fetchImpl: async () => { attempts++; throw new Error('timeout'); } }, {
    attempts: 3, sleep: async () => { sleeps++; },
  }), /timeout/);
  assert.equal(attempts, 3);
  assert.equal(sleeps, 2);
});

function fakeGitHub({ refSha = sha, prSha = sha, run = {} } = {}) {
  const updates = [];
  return {
    updates,
    paginate: async () => [{ head: { sha: prSha, repo: { full_name: 'owner/repo' } } }],
    rest: {
      git: { getRef: async () => ({ data: { object: { sha: refSha } } }) },
      pulls: { list: () => {} },
      actions: { getWorkflowRun: async () => ({ data: {
        path: '.github/workflows/staging-request.yml', conclusion: 'success',
        head_repository: { full_name: 'owner/repo' }, event: 'push', head_sha: sha,
        head_branch: target.branch, ...run,
      } }) },
      checks: {
        get: async () => ({ data: { head_sha: sha, name: 'Staging verification' } }),
        update: async data => { updates.push(data); },
      },
    },
  };
}
test('branch and PR must still point to the verified SHA', async () => {
  await assertCurrentTarget(fakeGitHub(), repo, target);
  await assert.rejects(assertCurrentTarget(fakeGitHub({ refSha: other }), repo, target), /Branch head changed/);
  await assert.rejects(assertCurrentTarget(fakeGitHub({ prSha: other }), repo, target), /PR head changed/);
});
test('resolver only accepts successful same-repository request workflow', async () => {
  const context = { repo, eventName: 'workflow_run', payload: { workflow_run: { id: 1 } } };
  assert.deepEqual(await resolveTarget(fakeGitHub(), context), target);
  for (const run of [{ conclusion: 'cancelled' }, { event: 'pull_request_target' }, { path: 'other.yml' }, { head_repository: { full_name: 'fork/repo' } }]) {
    await assert.rejects(resolveTarget(fakeGitHub({ run }), context));
  }
});
const successful = Object.fromEntries(['resolve', 'pending', 'frontend', 'api', 'verify'].map(job => [job, { result: 'success' }]));
test('only complete success on the current SHA publishes success', async () => {
  const github = fakeGitHub();
  await publishResult(github, repo, { checkId: 1, sha, current: true, results: successful });
  assert.equal(github.updates[0].conclusion, 'success');
  for (const job of ['frontend', 'api', 'verify']) {
    for (const result of ['failure', 'cancelled', 'skipped', undefined]) {
      const failed = fakeGitHub();
      await assert.rejects(publishResult(failed, repo, {
        checkId: 1, sha, current: true, results: { ...successful, [job]: { result } },
      }));
      assert.equal(failed.updates[0].conclusion, 'failure');
    }
  }
  const stale = fakeGitHub();
  await assert.rejects(publishResult(stale, repo, { checkId: 1, sha, current: false, results: successful }));
  assert.equal(stale.updates[0].conclusion, 'failure');
});
test('cannot publish to another SHA check', async () => {
  const github = fakeGitHub();
  await assert.rejects(publishResult(github, repo, { checkId: 1, sha: other, current: true, results: successful }), /identity mismatch/);
  assert.equal(github.updates.length, 0);
});
