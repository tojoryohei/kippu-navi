import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { parse } from 'yaml';

test('ビルドの有効権限・環境に外部資格情報を渡さない', () => {
  for (const file of ['deploy-frontend', 'deploy-api']) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 上の固定ワークフロー名だけを読む。
    const workflow = parse(readFileSync(new URL(`../../.github/workflows/${file}.yml`, import.meta.url), 'utf8'));
    const build = workflow.jobs.build;
    assert.ok(build);
    // ジョブで未指定の場合はワークフローの権限を継承する。
    const permissions = build.permissions ?? workflow.permissions;
    assert.equal(typeof permissions, 'object', '暗黙の既定権限やwrite-allを許可しない');
    assert.ok(permissions);
    for (const [scope, value] of Object.entries(permissions)) {
      assert.ok(value === 'none' || (scope === 'contents' && value === 'read'), `${scope}: ${value}`);
    }
    assert.equal(build.environment, undefined);
    assert.equal(build.secrets, undefined);
    // workflow全体のenvもジョブに届く。steps内のenv/with/runも検査する。
    for (const value of [workflow.env, build.env, build.steps, build.with]) {
      assert.doesNotMatch(JSON.stringify(value) ?? '', /\bsecrets\s*(?:\.|\[)/);
    }
    assert.equal(build.uses, undefined, '別workflowへ委譲する場合は委譲先の境界を検証する');
  }
});

test('Actionsは各bundleを直接転送し、公開資格情報の付与前にmanifestを検証する', () => {
  for (const [workflow, job, kind] of [['deploy-api', 'publish', 'api'], ['deploy-frontend', 'deploy', 'frontend'], ['deploy-frontend', 'sentry-upload', 'sentry']]) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- 固定したworkflow名だけを読む。
    const data = parse(readFileSync(new URL(`../../.github/workflows/${workflow}.yml`, import.meta.url), 'utf8'));
    const upload = data.jobs.build.steps.find(step => step.id === kind);
    assert.equal(upload.with.path, `\u0024{{ runner.temp }}/${kind}-bundle`);
    if (kind === 'frontend') assert.equal(upload.with['include-hidden-files'], true);
    // eslint-disable-next-line security/detect-object-injection -- 上の固定した公開ジョブ名だけを参照する。
    const steps = data.jobs[job].steps;
    const download = steps.find(step => step.uses?.startsWith('actions/download-artifact@'));
    assert.equal(download.with['artifact-ids'], `\u0024{{ needs.build.outputs.${kind}_id }}`);
    assert.equal(download.with.path, 'incoming');
    const check = steps.findIndex(step => step.run?.startsWith(`node control/scripts/deploy/artifact.mjs verify ${kind} incoming `));
    assert.ok(check >= 0);
    // eslint-disable-next-line security/detect-object-injection -- 実際に見つかった検証ステップだけを参照する。
    assert.equal(steps[check].env.EXPECTED_MANIFEST_SHA256, `\u0024{{ needs.build.outputs.${kind}_manifest_sha256 }}`);
    assert.equal(data.jobs.build.outputs[`${kind}_manifest_sha256`], `\u0024{{ steps.pack.outputs.${kind}_manifest_sha256 }}`);
    const privileged = steps.findIndex(step => step.uses?.startsWith('google-github-actions/auth@') || Object.keys(step.env ?? {}).some(key => ['CLOUDFLARE_API_TOKEN', 'SENTRY_AUTH_TOKEN'].includes(key)));
    assert.ok(privileged > check);
  }
});
