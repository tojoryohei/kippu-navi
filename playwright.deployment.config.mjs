import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const { defineConfig } = createRequire(resolve(process.env.SMOKE_TOOL_ROOT || '.', 'package.json'))('@playwright/test');
export default defineConfig({
  testDir: './tests/deployment',
  timeout: 90000,
  expect: { timeout: 45000 },
  retries: 0,
  workers: 1,
  forbidOnly: true,
  reporter: [['list'], ['json']],
  use: { browserName: 'chromium', trace: 'retain-on-failure', screenshot: 'only-on-failure', storageState: { cookies: [], origins: [] } },
});
