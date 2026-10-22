import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, readdirSync, appendFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';

const temp = process.env.RUNNER_TEMP;
const tools = join(temp, 'publish-tools/node_modules/.bin');
const target = resolve('target');
const bundle = join(temp, 'frontend-bundle');
mkdirSync(join(bundle, 'worker'), { recursive: true });
const version = JSON.parse(readFileSync(join(target, 'package.json'), 'utf8')).version;
if (!/^\d+\.\d+\.\d+(?:|-[a-zA-Z0-9.-]+)$/.test(version)) throw new Error('アプリのバージョンが不正です');
const release = `${version}+${process.env.TARGET_SHA}`;
const environment = process.env.DEPLOY_ENVIRONMENT;
// ビルド側ではtargetの設定を実行できるが、資格情報は持たない。
execFileSync(join(tools, 'wrangler'), ['deploy', '--dry-run', '--env', environment, '--outdir', join(temp, 'worker-build')], { cwd: target, stdio: 'inherit' });
cpSync(join(temp, 'worker-build/frontend.js'), join(bundle, 'worker/main.mjs'));
cpSync(join(target, 'dist'), join(bundle, 'static'), { recursive: true, filter: path => basename(path) !== '.DS_Store' });
const maps = join(temp, 'sentry-bundle/sourcemaps');
for (const name of readdirSync(maps)) {
  if (!name.endsWith('.js')) continue;
  if (!readFileSync(join(maps, name)).equals(readFileSync(join(bundle, 'static/_astro', name)))) throw new Error('送信用と公開用のJSが一致しません');
}
const env = { ...process.env, RELEASE: release };
for (const kind of ['frontend', 'sentry']) {
  execFileSync('python3', ['control/scripts/deploy/artifact.py', 'pack', kind, join(temp, `${kind}-bundle`), join(temp, `${kind}.tgz`)], { env, stdio: 'inherit' });
}
appendFileSync(process.env.GITHUB_OUTPUT, `release=${release}\nattempt=${process.env.GITHUB_RUN_ATTEMPT}\n`);
