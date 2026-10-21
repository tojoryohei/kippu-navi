import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { appendFileSync } from 'node:fs';
const root = join(process.env.RUNNER_TEMP, 'smoke-tools');
try {
  execFileSync(process.execPath, [join(root, 'node_modules/@playwright/test/cli.js'), 'test', '--config', 'playwright.deployment.config.mjs'], {
    stdio: 'inherit', env: { ...process.env, SMOKE_TOOL_ROOT: root, PLAYWRIGHT_JSON_OUTPUT_FILE: resolve('verification-results/browser.json') },
  });
} catch { process.exitCode = 1; }
finally {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\nブラウザー検証: **${process.exitCode ? '失敗' : '成功'}**。JSON・失敗トレースは同じrunのpublic artifactを参照。\n`);
}
