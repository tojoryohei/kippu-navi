import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Build a reviewable ruleset update without mutating GitHub or dropping existing checks.
export function prepareProtection(existing, appId) {
  assert.ok(Number.isSafeInteger(appId) && appId > 0, 'Expected dedicated GitHub App ID (not installation ID).');
  assert.equal(existing.enforcement, 'active');
  assert.deepEqual(existing.bypass_actors || [], [], 'Review bypass actors before enabling automerge.');
  const payload = Object.fromEntries(['name', 'target', 'enforcement', 'conditions', 'bypass_actors', 'rules']
    .filter(key => key in existing).map(key => [key, structuredClone(existing[key])]));
  const rule = payload.rules.find(rule => rule.type === 'required_status_checks');
  assert.ok(rule, 'Existing required checks must be preserved.');
  const checks = rule.parameters.required_status_checks.filter(check => !['dependabot-auto-merge', 'Required CI', 'Staging verification'].includes(check.context));
  checks.push({ context: 'Required CI', integration_id: 15368 });
  checks.push({ context: 'Staging verification', integration_id: appId });
  rule.parameters.required_status_checks = checks;
  rule.parameters.strict_required_status_checks_policy = true;
  return payload;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, appId] = process.argv.slice(2);
  assert.ok(file && appId, 'Usage: node scripts/staging/protection.mjs existing-ruleset.json APP_ID');
  console.log(JSON.stringify(prepareProtection(JSON.parse(readFileSync(file, 'utf8')), Number(appId)), null, 2));
}
