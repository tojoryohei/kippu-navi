import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCurrentTarget, resolveTarget } from '../../scripts/staging/checks.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const target = { sha, branch: 'test/staging' };
const repo = { owner: 'owner', repo: 'repo' };

function fakeGitHub({ refSha = sha, prSha = sha } = {}) {
  return {
    paginate: async () => [{ head: { sha: prSha, repo: { full_name: 'owner/repo' } } }],
    rest: {
      git: { getRef: async () => ({ data: { object: { sha: refSha } } }) },
      pulls: { list: () => {} },
    },
  };
}
test('branch and PR must still point to the verified SHA', async () => {
  await assertCurrentTarget(fakeGitHub(), repo, target);
  await assert.rejects(assertCurrentTarget(fakeGitHub({ refSha: other }), repo, target), /Branch head changed/);
  await assert.rejects(assertCurrentTarget(fakeGitHub({ prSha: other }), repo, target), /PR head changed/);
});

test('stagingは明示的な手動実行だけを受け付ける', async () => {
  const context = { repo, eventName: 'workflow_dispatch', payload: { inputs: { branch: target.branch } } };
  assert.deepEqual(await resolveTarget(fakeGitHub(), context), target);
  for (const eventName of ['workflow_run', 'push', 'pull_request']) {
    await assert.rejects(resolveTarget(fakeGitHub(), { ...context, eventName }), /Unsupported deployment event/);
  }
  await assert.rejects(resolveTarget(fakeGitHub(), { ...context, payload: { inputs: { branch: 'main' } } }), /Select a non-main branch/);
});
