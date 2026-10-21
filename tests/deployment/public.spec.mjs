import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { config, cases } from '../../scripts/verification/config.mjs';
import { verifyCalculator } from '../../scripts/verification/browser.mjs';
import { verifyManifest } from '../../scripts/verification/http.mjs';
const { test } = createRequire(resolve(process.env.SMOKE_TOOL_ROOT || '.', 'package.json'))('@playwright/test');
const c = config(process.env.DEPLOY_ENVIRONMENT);
for (const fixture of cases) {
  test(`${fixture.kind}: ${fixture.from}→${fixture.to} ${fixture.months ?? '-'}箇月`, async ({ page }, testInfo) => {
    const started = Date.now();
    const manifest = await verifyManifest(c.publicUrl, c.environment, process.env.EXPECTED_FRONTEND_SHA);
    const result = await verifyCalculator(page, c.publicUrl, manifest, fixture);
    await testInfo.attach('verification', { body: JSON.stringify({ ...result, expectedCommit: process.env.EXPECTED_FRONTEND_SHA, environment: c.environment, elapsedMs: Date.now() - started }), contentType: 'application/json' });
  });
}
