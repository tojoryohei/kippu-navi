import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// 通常CIを維持し、廃止したstaging条件を除くruleset更新案を生成する。
export function prepareProtection(existing) {
  assert.equal(existing.enforcement, 'active');
  assert.deepEqual(existing.bypass_actors || [], [], 'Review bypass actors before enabling automerge.');
  const payload = Object.fromEntries(['name', 'target', 'enforcement', 'conditions', 'bypass_actors', 'rules']
    .filter(key => key in existing).map(key => [key, structuredClone(existing[key])]));
  const rule = payload.rules.find(rule => rule.type === 'required_status_checks');
  assert.ok(rule, 'Existing required checks must be preserved.');
  const checks = rule.parameters.required_status_checks.filter(check => !['dependabot-auto-merge', 'Required CI', 'Staging verification', 'deploy', 'request'].includes(check.context));
  rule.parameters.required_status_checks = checks;
  rule.parameters.strict_required_status_checks_policy = true;
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file] = process.argv.slice(2);
  assert.ok(file, 'Usage: node scripts/staging/protection.mjs existing-ruleset.json');
  console.log(JSON.stringify(prepareProtection(JSON.parse(readFileSync(file, 'utf8'))), null, 2));
}
