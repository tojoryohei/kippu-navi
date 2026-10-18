import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareProtection } from '../../scripts/staging/protection.mjs';

test('cutover retains existing checks and binds staging to dedicated App', () => {
  const existing = {
    name: 'main', target: 'branch', enforcement: 'active', bypass_actors: [],
    conditions: { ref_name: { include: ['refs/heads/main'], exclude: [] } },
    rules: [{ type: 'non_fast_forward' }, { type: 'required_status_checks', parameters: {
      strict_required_status_checks_policy: false, required_status_checks: [
        { context: 'CodeQL', integration_id: 57789 },
        { context: 'dependabot-auto-merge', integration_id: 15368 },
      ],
    } }],
  };
  const result = prepareProtection(existing, 123);
  const rule = result.rules[1];
  assert.deepEqual(rule.parameters.required_status_checks, [
    { context: 'CodeQL', integration_id: 57789 },
    { context: 'Required CI', integration_id: 15368 },
    { context: 'Staging verification', integration_id: 123 },
  ]);
  assert.equal(rule.parameters.strict_required_status_checks_policy, true);
  assert.equal(existing.rules[1].parameters.required_status_checks[1].context, 'dependabot-auto-merge');
  assert.deepEqual(prepareProtection(result, 123), result);
  assert.throws(() => prepareProtection({ ...existing, bypass_actors: [{ actor_id: 1 }] }, 123));
  assert.throws(() => prepareProtection(existing, 0));
});
