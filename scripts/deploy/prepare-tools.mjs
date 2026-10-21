import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const versions = JSON.parse(readFileSync(new URL('./tools.json', import.meta.url), 'utf8'));
const root = join(process.env.RUNNER_TEMP, 'publish-tools');
mkdirSync(root, { recursive: true });
for (const version of Object.values(versions)) {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('公開ツールは固定版が必要です');
}
// リポジトリのpackage.jsonやインストールスクリプトを実行しない。
execFileSync('npm', ['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund', `wrangler@${versions.wrangler}`, `@sentry/cli@${versions.sentryCli}`], { stdio: 'inherit', cwd: process.env.RUNNER_TEMP });
