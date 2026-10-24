/* eslint-disable security/detect-non-literal-fs-filename, security/detect-object-injection -- テスト専用の一時ディレクトリとfixtureに攻撃入力を作る。 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { chmod, cp, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { digest, prepare, verify } from '../../scripts/deploy/artifact.mjs';

async function fixture(t, kind = 'api') {
  const root = await mkdtemp(join(tmpdir(), 'deploy-artifact-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = join(root, 'source');
  const destination = join(root, 'verified');
  const env = {
    TARGET_SHA: 'a'.repeat(40), CONTROL_SHA: 'b'.repeat(40), DEPLOY_ENVIRONMENT: 'staging',
    GITHUB_RUN_ID: '10', GITHUB_RUN_ATTEMPT: '1', EXPECTED_ATTEMPT: '1',
    GITHUB_OUTPUT: join(root, 'output'), RELEASE: '',
  };
  const files = kind === 'frontend' ? {
    'static/index.html': '<html></html>',
    'static/deployment.json': JSON.stringify({ commit: env.TARGET_SHA, environment: 'staging' }),
    'static/pwa-assets.json': '{}', 'static/sw.js': '', 'worker/main.mjs': 'export default {}',
    'static/optional.css': 'body {}', 'static/.well-known/api-catalog': '{}', 'static/_headers': '/*\n  X-Content-Type-Options: nosniff',
  } : kind === 'sentry' ? { 'sourcemaps/main.js': 'main', 'sourcemaps/main.js.map': '{}' } : { 'image.tar': 'docker image archive' };
  for (const [name, content] of Object.entries(files)) {
    await mkdir(dirname(join(source, name)), { recursive: true });
    await writeFile(join(source, name), content);
  }
  await prepare(kind, source, env);
  const manifestPath = join(source, 'manifest.json');
  env.EXPECTED_MANIFEST_SHA256 = await digest(manifestPath);
  const reseal = async edit => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await edit(manifest);
    await writeFile(manifestPath, JSON.stringify(manifest));
    env.EXPECTED_MANIFEST_SHA256 = await digest(manifestPath);
  };
  const reject = async (pattern = /./) => {
    await assert.rejects(verify(kind, source, destination, env), pattern);
    await assert.rejects(lstat(destination), { code: 'ENOENT' });
  };
  return { root, source, destination, env, files, manifestPath, reseal, reject };
}

for (const kind of ['api', 'frontend', 'sentry']) {
  test(`${kind}: ディレクトリ転送後も全ファイルを検証し、下流ジョブだけ再実行できる`, async t => {
    const f = await fixture(t, kind);
    const script = fileURLToPath(new URL('../../scripts/deploy/artifact.mjs', import.meta.url));
    if (kind === 'api') {
      // APIのworkflowが使うCLI入口も、この正常系にまとめて確認する。
      await rm(f.manifestPath);
      await writeFile(f.env.GITHUB_OUTPUT, '');
      execFileSync(process.execPath, [script, 'prepare', kind, f.source], { env: { ...process.env, ...f.env } });
    }
    // GitHub Actionsがディレクトリの内容を取得した状態を再現する。
    const incoming = join(f.root, 'incoming');
    await cp(f.source, incoming, { recursive: true });
    const env = { ...f.env, GITHUB_RUN_ATTEMPT: '2' };
    if (kind === 'api') execFileSync(process.execPath, [script, 'verify', kind, incoming, f.destination], { env: { ...process.env, ...env } });
    else await verify(kind, incoming, f.destination, env);
    for (const [name, content] of Object.entries(f.files)) {
      assert.equal(await readFile(join(f.destination, name), 'utf8'), content);
      assert.equal((await lstat(join(f.destination, name))).mode & 0o7777, 0o644);
    }
    const outputs = await readFile(f.env.GITHUB_OUTPUT, 'utf8');
    assert.equal(outputs, `${kind}_manifest_sha256=${f.env.EXPECTED_MANIFEST_SHA256}\n`);
  });
}

test('ビルド出力と異なるmanifestを拒否する', async t => {
  const f = await fixture(t);
  await writeFile(f.manifestPath, `${await readFile(f.manifestPath, 'utf8')} `);
  await f.reject(/manifestのSHA-256/);
});

test('SHA・環境・run・attempt・release・種別の取り違えを拒否する', async t => {
  const f = await fixture(t);
  for (const [key, value] of Object.entries({
    TARGET_SHA: 'c'.repeat(40), CONTROL_SHA: 'd'.repeat(40), DEPLOY_ENVIRONMENT: 'production',
    EXPECTED_ATTEMPT: '2', GITHUB_RUN_ID: '11', RELEASE: `5.2.0+${'e'.repeat(40)}`,
  })) {
    await assert.rejects(verify('api', f.source, f.destination, { ...f.env, [key]: value }), /一致しません/);
  }
  await f.reseal(manifest => { manifest.kind = 'sentry'; });
  await f.reject(/一致しません/);
});

test('ファイル改変・欠落・追加を拒否する', async t => {
  for (const mutation of ['change', 'missing', 'extra']) {
    await t.test(mutation, async t => {
      const f = await fixture(t, 'frontend');
      const path = join(f.source, 'static/optional.css');
      if (mutation === 'change') await writeFile(path, 'changed');
      if (mutation === 'missing') await rm(path);
      if (mutation === 'extra') await writeFile(join(f.source, 'static/extra.html'), 'extra');
      await f.reject(/SHA-256|ファイル一覧/);
    });
  }
});

test('manifestもハッシュも整合している公開不可ファイルを拒否する', async t => {
  for (const name of ['static/package.json', 'static/wrangler.jsonc', 'static/file.map', 'static/deploy.sh', 'worker/config.json', 'static/.secret.json', 'static/.hidden/file.html', 'static/back\\slash.html']) {
    await t.test(name, async t => {
      const f = await fixture(t, 'frontend');
      const path = join(f.source, name);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, '');
      await f.reseal(async manifest => { manifest.files[name] = await digest(path); });
      await f.reject(/許可しない|不正なパス/);
    });
  }
});

test('ファイル・ディレクトリ・ルートのsymlink、hardlink、FIFO、実行権限を拒否する', async t => {
  for (const mutation of ['file-link', 'directory-link', 'root-link', 'hardlink', 'fifo', 'executable']) {
    await t.test(mutation, async t => {
      const f = await fixture(t);
      const payload = join(f.source, 'image.tar');
      const outside = join(f.root, 'outside');
      await writeFile(outside, 'outside');
      if (mutation === 'file-link') { await rm(payload); await symlink(outside, payload); }
      if (mutation === 'directory-link') await symlink(f.root, join(f.source, 'loop'));
      if (mutation === 'root-link') {
        const moved = join(f.root, 'moved');
        await cp(f.source, moved, { recursive: true });
        await rm(f.source, { recursive: true });
        await symlink(moved, f.source);
      }
      if (mutation === 'hardlink') { await rm(payload); await link(outside, payload); }
      if (mutation === 'fifo') { await rm(payload); execFileSync('mkfifo', [payload]); }
      if (mutation === 'executable') await chmod(payload, 0o755);
      await f.reject(/リンク|通常の/);
    });
  }
});

test('manifestの欠落と読み込み前のサイズ上限を検査する', async t => {
  for (const mutation of ['missing', 'oversized']) {
    await t.test(mutation, async t => {
      const f = await fixture(t);
      if (mutation === 'missing') await rm(f.manifestPath);
      if (mutation === 'oversized') await truncate(f.manifestPath, 8 * 1024 ** 2 + 1);
      await f.reject(/manifestがありません|manifestが上限/);
    });
  }
});

test('容量上限をハッシュ読み込み前に検査する', async t => {
  const f = await fixture(t);
  // sparse fileなので8GiBの書き込み・ハッシュ計算は発生しない。
  await truncate(join(f.source, 'image.tar'), 8 * 1024 ** 3 + 1);
  await f.reject(/上限/);
});

test('整合したmanifestでも必須成果物の欠落を拒否する', async t => {
  for (const kind of ['api', 'frontend', 'sentry']) {
    await t.test(kind, async t => {
      const f = await fixture(t, kind);
      const name = kind === 'api' ? 'image.tar' : kind === 'frontend' ? 'static/sw.js' : 'sourcemaps/main.js.map';
      await rm(join(f.source, name));
      await f.reseal(manifest => { delete manifest.files[name]; });
      await f.reject(/必須成果物/);
    });
  }
});

test('deployment.jsonの公開対象を全検証完了前に照合する', async t => {
  const f = await fixture(t, 'frontend');
  const path = join(f.source, 'static/deployment.json');
  for (const deployment of [
    { commit: 'c'.repeat(40), environment: 'staging' },
    { commit: f.env.TARGET_SHA, environment: 'production' },
  ]) {
    await writeFile(path, JSON.stringify(deployment));
    await f.reseal(async manifest => { manifest.files['static/deployment.json'] = await digest(path); });
    await f.reject(/deployment.json/);
  }
});

test('既存の出力先と壊れたsymlinkを上書きしない', async t => {
  const f = await fixture(t);
  await mkdir(f.destination);
  const sentinel = join(f.destination, 'sentinel');
  await writeFile(sentinel, 'keep');
  await assert.rejects(verify('api', f.source, f.destination, f.env), /新規ディレクトリ/);
  assert.equal(await readFile(sentinel, 'utf8'), 'keep');
  await rm(f.destination, { recursive: true });
  await symlink(join(f.root, 'missing'), f.destination);
  await assert.rejects(verify('api', f.source, f.destination, f.env), /新規ディレクトリ/);
});

test('生成時に空の成果物と古いmanifestの再利用を拒否する', async t => {
  for (const mutation of ['empty', 'existing-manifest']) {
    await t.test(mutation, async t => {
      const f = await fixture(t);
      if (mutation !== 'existing-manifest') await rm(f.manifestPath);
      if (mutation === 'empty') await rm(join(f.source, 'image.tar'));
      const before = await readFile(f.env.GITHUB_OUTPUT, 'utf8');
      await assert.rejects(prepare('api', f.source, f.env), /成果物が空|manifestは新規/);
      assert.equal(await readFile(f.env.GITHUB_OUTPUT, 'utf8'), before);
    });
  }
});
