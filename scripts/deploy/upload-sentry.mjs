import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const { SENTRY_AUTH_TOKEN: token, RELEASE: release, RUNNER_TEMP: temp } = process.env;
if (!token || !process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT) throw new Error('Sentryの資格情報・組織・プロジェクトが必要です');
if (!/^\d+\.\d+\.\d+(?:|-[a-zA-Z0-9.-]+)\+[a-f0-9]{40}$/.test(release)) throw new Error('releaseが不正です');
// 値をログへ出さず、発行方式のみを記録する。権限縮小は発行元でも確認する。
console.log(`Sentryトークン方式: ${token.startsWith('sntrys_') ? '組織トークン' : token.startsWith('sntryu_') ? '個人トークン' : '旧形式・発行元での確認が必要'}`);
const cli = join(temp, 'publish-tools/node_modules/.bin/sentry-cli');
const run = args => execFileSync(cli, args, { cwd: temp, stdio: 'inherit' });
// 同じreleaseでの再実行を許可し、送信失敗時は公開へ進まない。
run(['releases', 'new', release]);
run(['sourcemaps', 'upload', '--release', release, '--validate', join(temp, 'verified-sentry/sourcemaps')]);
run(['releases', 'finalize', release]);
