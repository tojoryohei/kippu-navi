import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('ビルドに外部資格情報・OIDC・Environmentを渡さない', () => {
  // 読み取り対象はこのテスト内で固定したワークフローだけ。
  // eslint-disable-next-line security/detect-non-literal-fs-filename
  const workflow = name => readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
  for (const name of ['deploy-frontend', 'deploy-api']) {
    const build = workflow(name).split('\n  build:\n')[1].split(/\n  [\w-]+:\n/)[0];
    assert.doesNotMatch(build, /secrets\.|id-token:|^    environment:/m);
  }
});
