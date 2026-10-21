import { mkdirSync, writeFileSync } from 'node:fs';
import { statusDiagnostic } from './diagnostics.mjs';
import { config, cases, queryFor } from './config.mjs';
const c = config(process.env.DEPLOY_ENVIRONMENT);
if (c.environment !== 'staging' || !process.env.WRONG_AUDIENCE_TOKEN) throw new Error('ステージング専用の認証拒否検証です');
const results = [];
try {
  for (const mode of ['unauthenticated', 'wrong_audience']) {
    const response = await fetch(`${c.serviceUrl}/api/split/auto/ticket?${queryFor(cases[0])}`, { signal: AbortSignal.timeout(35000), redirect: 'error',
      headers: mode === 'wrong_audience' ? { Authorization: `Bearer ${process.env.WRONG_AUDIENCE_TOKEN}` } : {} });
    await response.body?.cancel();
    results.push({ mode, expected: [401, 403], actual: statusDiagnostic(response.status) });
    if (![401, 403].includes(response.status)) throw new Error(`${mode}: Cloud Runが認証失敗を拒否しませんでした`);
  }
} catch { process.exitCode = 1; results.push({ error: '認証拒否検証に失敗しました。HTTPステータスと該当ステップを確認してください' }); }
finally { mkdirSync('verification-results', { recursive: true }); writeFileSync('verification-results/auth-rejection.json', JSON.stringify(results, null, 2)); }
