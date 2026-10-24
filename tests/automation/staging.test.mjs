import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { config } from '../../scripts/verification/config.mjs';
import { assertCurrentTarget, resolveTarget } from '../../scripts/staging/checks.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const target = { sha, branch: 'test/staging' };
const repo = { owner: 'owner', repo: 'repo' };
const pull = {
  head: { ref: target.branch, sha, repo: { full_name: 'owner/repo' } },
};
const run = {
  path: '.github/workflows/staging-request.yml', event: 'push', status: 'completed', conclusion: 'success',
  repository: { full_name: 'owner/repo' }, head_repository: { full_name: 'owner/repo' },
  head_branch: target.branch, head_sha: sha, pull_requests: [],
};
const automatic = { repo, eventName: 'workflow_run', payload: { workflow_run: { id: 123 } } };

function fakeGitHub({ refSha = sha, prSha = sha, pulls = [{ ...pull, head: { ...pull.head, sha: prSha } }], workflowRun = run } = {}) {
  return {
    paginate: async () => pulls,
    rest: {
      git: { getRef: async () => ({ data: { object: { sha: refSha } } }) },
      pulls: { list: () => {} },
      actions: { getWorkflowRun: async params => {
        assert.deepEqual(params, { ...repo, run_id: 123 });
        return { data: workflowRun };
      } },
    },
  };
}
test('branch and PR must still point to the verified SHA', async () => {
  await assertCurrentTarget(fakeGitHub(), repo, target);
  await assert.rejects(assertCurrentTarget(fakeGitHub({ refSha: other }), repo, target), /Branch head changed/);
  await assert.rejects(assertCurrentTarget(fakeGitHub({ prSha: other }), repo, target), /PR head changed/);
});

test('手動公開はPRのない非mainブランチも受け付け、直接のpush・PRイベントは拒否する', async () => {
  const context = { repo, eventName: 'workflow_dispatch', payload: { inputs: { branch: target.branch } } };
  assert.deepEqual(await resolveTarget(fakeGitHub(), context), target);
  assert.deepEqual(await resolveTarget(fakeGitHub({ pulls: [] }), context), target);
  for (const eventName of ['push', 'pull_request', 'pull_request_target']) {
    await assert.rejects(resolveTarget(fakeGitHub(), { ...context, eventName }), /Unsupported deployment event/);
  }
  await assert.rejects(resolveTarget(fakeGitHub(), { ...context, payload: { inputs: { branch: 'main' } } }), /Select a non-main branch/);
});

test('push・PR作成の公開要求から対象SHAを固定し、外部forkや古い要求を拒否する', async () => {
  for (const event of ['push', 'pull_request']) {
    assert.deepEqual(await resolveTarget(fakeGitHub({ workflowRun: { ...run, event } }), automatic), target);
  }
  // PRがない開発ブランチもpushで公開できる。
  assert.deepEqual(await resolveTarget(fakeGitHub({ pulls: [] }), automatic), target);
  await assert.rejects(resolveTarget(fakeGitHub({ refSha: other }), automatic), /Branch head changed/);
  // イベント内の実行情報で公開可否を決めず、取得した実行記録を照合する。
  for (const change of [
    { path: '.github/workflows/test.yml' }, { event: 'workflow_dispatch' }, { status: 'in_progress' },
    { conclusion: 'failure' }, { conclusion: 'cancelled' },
    { repository: { full_name: 'other/repo' } }, { head_repository: { full_name: 'fork/repo' } },
    { head_branch: 'main' }, { head_sha: 'invalid' },
  ]) {
    assert.equal(await resolveTarget(fakeGitHub({ workflowRun: { ...run, ...change } }), automatic), null);
  }
});

test('ビルドと公開でWranglerの配信先・bindingsを一致させる', () => {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- リポジトリ内の固定URLのみを読む。
  const original = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8').replace(/,\s*([}\]])/g, '$1'));
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- リポジトリ内の固定URLのみを読む。
  const settings = JSON.parse(readFileSync(new URL('../../scripts/deploy/wrangler-settings.json', import.meta.url), 'utf8'));
  assert.equal(settings.compatibility_date, original.compatibility_date);
  const { directory: _directory, ...assets } = original.assets;
  assert.deepEqual(settings.assets, assets);
  assert.deepEqual(settings.observability, original.observability);
  for (const environment of ['staging', 'production']) {
    const selected = environment === 'production' ? settings.environments.production : settings.environments.staging;
    assert.equal(config(environment).serviceUrl, selected.vars.API_ORIGIN);
    const expected = environment === 'production' ? original.env.production : original.env.staging;
    assert.deepEqual(
      { name: selected.name, vars: selected.vars, routes: selected.routes },
      { name: expected.name, vars: expected.vars, routes: expected.routes },
    );
    assert.deepEqual(settings.secrets, expected.secrets);
  }
});
