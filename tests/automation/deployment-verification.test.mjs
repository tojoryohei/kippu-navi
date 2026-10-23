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
