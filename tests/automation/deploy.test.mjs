import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

function jobs(name) {
  const source = readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
  return Object.fromEntries([...source.slice(source.indexOf('\njobs:')).matchAll(/^  ([\w-]+):\n([\s\S]*?)(?=^  [\w-]+:\n|$(?![\s\S]))/gm)].map(match => [match[1], match[2]]));
}

for (const name of ['deploy-frontend', 'deploy-api']) {
  test(`${name}のビルドに外部資格情報・OIDC・Environmentを渡さない`, () => {
    const build = jobs(name).build;
    assert.ok(build);
    assert.doesNotMatch(build, /secrets\.|id-token:|^    environment:|google-github-actions\/auth|docker\/login-action/m);
    assert.match(build, /ref: \$\{\{ needs.resolve.outputs.target_sha \}\}/);
    assert.match(build, /persist-credentials: false/);
    assert.match(build, /retention-days: 1/);
  });
  test(`${name}の公開ジョブはcontrol_shaを使い、成果物をID指定で取得する`, () => {
    for (const [jobName, job] of Object.entries(jobs(name))) {
      if (['resolve', 'build', 'wait-frontend'].includes(jobName)) continue;
      assert.match(job, /ref: \$\{\{ needs.resolve.outputs.control_sha \}\}/);
      assert.doesNotMatch(job, /npm ci|npm run build|docker build|wrangler-action/);
      if (job.includes('download-artifact')) {
        assert.match(job, /artifact-ids: \$\{\{ needs.build.outputs.\w+_id \}\}/);
        assert.match(job, /EXPECTED_SHA256: \$\{\{ needs.build.outputs.\w+_sha256 \}\}/);
        assert.match(job, /EXPECTED_ATTEMPT: \$\{\{ needs.build.outputs.attempt \}\}/);
      }
    }
  });
}

test('公開用設定の基礎値は既存Wrangler設定と一致し、実行設定を含まない', () => {
  const original = JSON.parse(readFileSync(new URL('../../wrangler.jsonc', import.meta.url), 'utf8').replace(/,\s*([}\]])/g, '$1'));
  const settings = JSON.parse(readFileSync(new URL('../../scripts/deploy/wrangler-settings.json', import.meta.url), 'utf8'));
  assert.equal(settings.compatibility_date, original.compatibility_date);
  const { directory: _directory, ...assets } = original.assets;
  assert.deepEqual(settings.assets, assets);
  assert.deepEqual(settings.observability, original.observability);
  for (const environment of ['staging', 'production']) {
    for (const key of ['name', 'vars', 'routes']) assert.deepEqual(settings.environments[environment][key], original.env[environment][key]);
    assert.deepEqual(settings.secrets, original.env[environment].secrets);
  }
  assert.doesNotMatch(JSON.stringify(settings), /"build"|"command"|"find_additional_modules"/);
});
