import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyApi } from '../../scripts/verification/http.mjs';
import { cases, config, expectedJson } from '../../scripts/verification/config.mjs';
const sha = 'a'.repeat(40);
const fixture = cases[0];
const response = (status = 200, commit = sha, json = expectedJson(fixture)) => new Response(JSON.stringify(json), { status, headers: { 'X-Deployment-Commit': commit, 'X-Request-ID': 'test-id' } });
const options = { base: config('staging').serviceUrl, token: 'not-a-real-token', expectedCommit: sha, fixtures: [fixture], sleep: async () => {} };
test('3券種の直接検索で認証・入力・SHA・JSONを検証する', async () => {
  let n = 0;
  const report = await verifyApi({ base: options.base, token: options.token, expectedCommit: sha, fetcher: async (url, init) => {
    const c = cases[n++]; const parsed = new URL(url);
    assert.equal(parsed.pathname, `/api/split/auto/${c.kind}`);
    assert.equal(parsed.searchParams.get('months'), c.months ? String(c.months) : null);
    assert.equal(init.headers.Authorization, `Bearer ${options.token}`);
    assert.equal(init.signal instanceof AbortSignal, true);
    assert.equal(init.cache, undefined);
    return response(200, sha, expectedJson(c));
  } });
  assert.equal(n, 3);
  assert.deepEqual(report[0].actual, expectedJson(fixture));
});
test('期待SHA・期待JSONを変えると即時失敗し、トークンを記録しない', async () => {
  for (const [expectedCommit, json] of [['b'.repeat(40), expectedJson(fixture)], [sha, { unexpected: true }]]) {
    let n = 0; const records = [];
    await assert.rejects(verifyApi({ ...options, expectedCommit, fetcher: async () => { n++; return response(200, sha, json); }, record: row => records.push(row) }), /不一致/);
    assert.equal(n, 1);
    assert.equal(records[0].success, false);
    assert.equal(JSON.stringify(records).includes(options.token), false);
    assert.ok(records[0].elapsedMs >= 0);
  }
});
test('起動待ち候補だけを最大2回再試行する', async () => {
  for (const failure of [() => { throw new Error('timeout'); }, () => new Response('unavailable', { status: 503 })]) {
    let n = 0; const delays = [];
    await assert.rejects(verifyApi({ ...options, fetcher: async () => { n++; return failure(); }, sleep: async ms => delays.push(ms) }));
    assert.equal(n, 3); assert.deepEqual(delays, [5000, 10000]);
  }
  let n = 0;
  await verifyApi({ ...options, fetcher: async () => ++n === 1 ? new Response('', { status: 503 }) : response() });
  assert.equal(n, 2);
});
test('認証・アプリ障害と、一度正常応答を得た後の障害は再試行しない', async () => {
  for (const status of [401, 403, 400, 500, 503]) {
    let n = 0;
    await assert.rejects(verifyApi({ ...options, fetcher: async () => { n++; return response(status); } }));
    assert.equal(n, 1);
  }
  let n = 0;
  await assert.rejects(verifyApi({ ...options, fixtures: [fixture, fixture], fetcher: async () => ++n === 1 ? response() : new Response('', { status: 503 }) }));
  assert.equal(n, 2);
});
test('JSONでない直接応答を拒否する', async () => {
  await assert.rejects(verifyApi({ ...options, fetcher: async () => new Response('not JSON', { headers: { 'X-Deployment-Commit': sha } }) }), /JSON/);
});

test('APIがトークンをechoしてもartifactとSummaryのシリアライズでは伏せる', async () => {
  const { serializeReport } = await import('../../scripts/verification/report.mjs');
  const token = 'test-sensitive-id-token';
  const serialized = serializeReport({ actual: { echoed: `Bearer ${token}` }, nested: [`prefix ${token}`] }, [token]);
  assert.equal(serialized.includes(token), false);
  assert.equal(JSON.parse(serialized).actual.echoed, 'Bearer [REDACTED]');
});

test('許可外の送信先・検索入力ではトークンを送る前に拒否する', async () => {
  let sent = 0;
  const fetcher = async () => { sent++; return response(); };
  for (const base of ['https://attacker.invalid', `${options.base}/unexpected`, 'https://staging.kippu-navi.com']) {
    await assert.rejects(verifyApi({ ...options, base, fetcher }), /接続先/);
  }
  await assert.rejects(verifyApi({ ...options, fixtures: [{ ...fixture, from: '送信してはいけない値' }], fetcher }), /固定ケース/);
  assert.equal(sent, 0);
});

test('通信由来の任意本文・ヘッダー・例外を保存せず、識別子とJSON差異は残す', async () => {
  const secret = 'untrusted-response-marker';
  const requestId = '12345678-abcd-1234-abcd-1234567890ab';
  const rows = [];
  const records = [];
  const invalid = new Response(JSON.stringify({ normal: [fixture.from, secret], results: [], extra: secret }), {
    headers: { 'X-Deployment-Commit': sha, 'X-Request-ID': requestId, 'CF-Cache-Status': secret, Age: secret },
  });
  await assert.rejects(verifyApi({ ...options, fetcher: async () => invalid, record: row => rows.push(row) }), /JSON不一致/);
  assert.equal(JSON.stringify(rows).includes(secret), false);
  assert.equal(rows[0].actualCommit, sha);
  assert.equal(rows[0].requestId, requestId);
  assert.equal(rows[0].status, 200);
  assert.deepEqual(rows[0].actual.normal.stations, [fixture.from, { type: 'string', unexpected: true }]);
  assert.equal(rows[0].actual.unexpectedKeyCount, 1);
  await assert.rejects(verifyApi({ ...options, fetcher: async () => { throw new Error(secret); }, record: row => records.push(row) }));
  assert.equal(JSON.stringify(records).includes(secret), false);
});
