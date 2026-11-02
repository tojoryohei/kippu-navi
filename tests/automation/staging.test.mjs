import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { config } from '../../scripts/verification/config.mjs';
import { assertCurrentTarget } from '../../scripts/staging/checks.mjs';
import { resolveTarget } from '../../scripts/deploy/target.mjs';

const sha = 'a'.repeat(40);
const other = 'b'.repeat(40);
const target = { sha, branch: 'test/staging' };
const repo = { owner: 'owner', repo: 'repo' };
const pull = {
  head: { ref: target.branch, sha, repo: { full_name: 'owner/repo' } },
};
function fakeGitHub({ refSha = sha, prSha = sha, pulls = [{ ...pull, head: { ...pull.head, sha: prSha } }] } = {}) {
  return {
    paginate: async () => pulls,
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

test('手動公開はPRのない非mainブランチも受け付け、自動イベントは拒否する', async () => {
  const context = { repo, ref: 'refs/heads/main', eventName: 'workflow_dispatch', payload: { inputs: { branch: target.branch } } };
  assert.deepEqual(await resolveTarget(fakeGitHub(), context, 'staging'), target);
  assert.deepEqual(await resolveTarget(fakeGitHub({ pulls: [] }), context, 'staging'), target);
  for (const eventName of ['push', 'pull_request', 'pull_request_target', 'workflow_run']) {
    await assert.rejects(resolveTarget(fakeGitHub(), { ...context, eventName }, 'staging'), /mainから手動/);
  }
  await assert.rejects(resolveTarget(fakeGitHub(), { ...context, payload: { inputs: { branch: 'main' } } }, 'staging'), /Select a non-main branch/);
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

test('本番は起動時のSHAではなく、対象確定時のmain先頭を使用する', async () => {
  const context = { repo, ref: 'refs/heads/main', eventName: 'workflow_dispatch', sha: other, payload: { inputs: { mode: 'normal' } } };
  const resolved = await resolveTarget(fakeGitHub(), context, 'production');
  assert.deepEqual(resolved, { sha, branch: 'main' });
  for (const environment of ['production', 'staging']) {
    await assert.rejects(resolveTarget(fakeGitHub(), { ...context, ref: 'refs/heads/feature' }, environment), /mainから手動/);
  }
});

test('復旧入力の混入や不完全な指定を拒否し、復旧SHAをmain先頭で上書きしない', async () => {
  const context = { repo, ref: 'refs/heads/main', eventName: 'workflow_dispatch' };
  const resolve = inputs => resolveTarget(fakeGitHub(), { ...context, payload: { inputs } }, 'production');
  assert.deepEqual(await resolve({ mode: 'restore', target_sha: other, reason: '障害復旧' }), { sha: other, branch: 'main' });
  for (const inputs of [
    { mode: 'normal', target_sha: other },
    { mode: 'normal', reason: '復旧理由' },
    { mode: 'restore', target_sha: other },
    { mode: 'restore', target_sha: 'short', reason: '障害復旧' },
    { mode: 'unknown' },
  ]) await assert.rejects(resolve(inputs));
});
