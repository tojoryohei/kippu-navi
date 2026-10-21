import { isDeepStrictEqual } from 'node:util';
import { SHA } from '../deploy/policy.mjs';
import { cases, config, trustedApiBase, selectCase, queryFor, expectedJson } from './config.mjs';
import { commitDiagnostic, enginePathDiagnostic, requestIdDiagnostic, statusDiagnostic, cacheDiagnostic, ageDiagnostic, jsonDiagnostic, manifestDiagnostic } from './diagnostics.mjs';

const failures = Object.freeze([
  ['manifest', 'deployment.jsonの環境・SHA・enginePathが期待値と一致しません'],
  ['manifest_json', 'deployment.jsonの応答がJSONではありません'],
  ['transport', 'APIへの接続失敗またはタイムアウト'],
  ['http_status', 'APIのHTTPステータスが期待値と一致しません'],
  ['commit', 'APIのバイナリ内SHA不一致'],
  ['json_parse', 'API応答がJSONではありません'],
  ['json', 'APIのJSON不一致'],
]);
export class VerificationError extends Error {
  constructor(code, details) {
    super(failures.find(failure => failure[0] === code)?.[1] ?? '検証処理に失敗しました');
    this.code = code;
    this.details = details;
  }
}
export function failureMessage(error) {
  return failures.find(failure => failure[0] === error?.code)?.[1] ?? '検証中に通信または想定外のエラーが発生しました';
}

export async function verifyManifest(base, environment, sha, fetcher = fetch) {
  const selected = config(environment);
  if (base !== selected.publicUrl) throw new Error('manifestの接続先が対象環境と一致しません');
  const response = await fetcher(`${selected.publicUrl}/deployment.json`, { signal: AbortSignal.timeout(35000), redirect: 'error' });
  let manifest;
  try { manifest = await response.json(); } catch { throw new VerificationError('manifest_json'); }
  if (response.status !== 200 || manifest?.environment !== environment || !SHA.test(sha) || manifest?.commit !== sha
      || !/^\/engine\/[a-f0-9]{64}$/.test(manifest?.enginePath)) {
    throw new VerificationError('manifest', { status: statusDiagnostic(response.status), expected: { environment, commit: sha }, actual: manifestDiagnostic(manifest) });
  }
  return { environment: selected.environment, commit: sha, enginePath: enginePathDiagnostic(manifest.enginePath) };
}

export async function verifyApi({ base, token, expectedCommit, fetcher = fetch, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)), fixtures = cases, record = () => {} }) {
  const selectedBase = trustedApiBase(base, Boolean(token));
  const rows = [];
  let startup = Boolean(token);
  for (const input of fixtures) {
    const c = selectCase(input);
    const started = Date.now();
    const row = { check: c.kind, url: `${selectedBase}/api/split/auto/${c.kind}?${queryFor(c)}`, expectedCommit: expectedCommit ?? null, expected: expectedJson(c), attempts: [], success: false };
    rows.push(row);
    try {
      for (let attempt = 0; ; attempt++) {
        let response;
        try {
          response = await fetcher(row.url, { signal: AbortSignal.timeout(35000), redirect: 'error', headers: token ? { Authorization: `Bearer ${token}` } : {} });
        } catch {
          row.attempts.push({ attempt, failure: 'transport_or_timeout', startupCandidate: startup });
          if (startup && attempt < 2) { await sleep((attempt === 0 ? 5000 : 10000)); continue; }
          throw new VerificationError('transport');
        }
        row.status = statusDiagnostic(response.status);
        row.actualCommit = commitDiagnostic(response.headers.get('x-deployment-commit'));
        row.requestId = requestIdDiagnostic(response.headers.get('x-request-id'));
        row.cacheStatus = cacheDiagnostic(response.headers.get('cf-cache-status'));
        row.age = ageDiagnostic(response.headers.get('age'));
        row.attempts.push({ attempt, status: row.status, startupCandidate: startup && row.status === 503 && !row.actualCommit });
        if (startup && row.status === 503 && !row.actualCommit && attempt < 2) {
          await response.body?.cancel();
          await sleep((attempt === 0 ? 5000 : 10000)); continue;
        }
        startup = false;
        if (response.status !== 200) { await response.body?.cancel(); throw new VerificationError('http_status'); }
        if (expectedCommit && row.actualCommit !== expectedCommit) { await response.body?.cancel(); throw new VerificationError('commit'); }
        let actual;
        try { actual = await response.json(); } catch { throw new VerificationError('json_parse'); }
        const matches = isDeepStrictEqual(actual, row.expected);
        row.actual = matches ? row.expected : jsonDiagnostic(actual, c);
        if (!matches) throw new VerificationError('json');
        row.success = true;
        break;
      }
    } catch (error) {
      row.error = failureMessage(error);
      throw error;
    } finally {
      row.elapsedMs = Date.now() - started;
      record(row);
    }
  }
  return rows;
}
