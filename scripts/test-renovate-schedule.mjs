// Exercise Renovate's actual schedule evaluator, not a duplicate cron implementation.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const root = process.env.RENOVATE_PACKAGE_ROOT;
assert.ok(root, 'RENOVATE_PACKAGE_ROOT must point to the pinned validator package.');
const { isScheduledNow } = await import(pathToFileURL(`${root}/dist/workers/repository/update/branch/schedule.js`).href);
const { Settings } = await import(pathToFileURL(`${root}/../luxon/build/es6/luxon.mjs`).href);
const config = JSON.parse(readFileSync(new URL('../renovate.json', import.meta.url), 'utf8'));
const { init } = await import(pathToFileURL(`${root}/dist/logger/index.js`).href);
await init();
const originalNow = Settings.now;
try {
  for (const [time, expected] of [['02:59:00', false], ['03:00:00', true], ['05:59:59', true], ['06:00:00', false]]) {
    Settings.now = () => Date.parse(`2026-10-19T${time}+09:00`);
    assert.equal(isScheduledNow(config), expected, `update schedule at ${time}`);
  }
  for (const [date, expected] of [['2026-10-19', true], ['2026-10-20', false]]) {
    Settings.now = () => Date.parse(`${date}T04:00:00+09:00`);
    assert.equal(isScheduledNow({ ...config, ...config.lockFileMaintenance }), expected);
  }
} finally {
  Settings.now = originalNow;
}
console.log('Renovate schedule boundaries verified (Asia/Tokyo).');
