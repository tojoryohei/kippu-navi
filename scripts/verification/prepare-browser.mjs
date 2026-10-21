import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
const version = JSON.parse(readFileSync(new URL('../deploy/tools.json', import.meta.url), 'utf8')).playwright;
if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error('Playwrightは固定版が必要です');
const root = join(process.env.RUNNER_TEMP, 'smoke-tools');
mkdirSync(root, { recursive: true });
execFileSync('npm', ['install', '--prefix', root, '--ignore-scripts', '--no-audit', '--no-fund', `@playwright/test@${version}`], { cwd: process.env.RUNNER_TEMP, stdio: 'inherit' });
execFileSync(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'install', '--with-deps', 'chromium'], { stdio: 'inherit' });
