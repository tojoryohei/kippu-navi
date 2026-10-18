import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';

export async function verifyStaging({ sha, origin = 'https://staging.kippu-navi.com', fetchImpl = fetch }) {
  assert.match(sha, /^[a-f0-9]{40}$/);
  const get = async path => {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin, 'Smoke tests must stay on the staging origin.');
    const response = await fetchImpl(url, {
      headers: { 'Cache-Control': 'no-cache' }, redirect: 'error', signal: AbortSignal.timeout(15000),
    });
    assert.equal(response.status, 200, `${url.pathname}: HTTP ${response.status}`);
    return response;
  };
  const manifest = async () => {
    const data = await (await get('/deployment.json')).json();
    assert.equal(data.environment, 'staging');
    assert.equal(data.commit, sha, 'Frontend SHA does not match.');
    assert.match(data.enginePath, /^\/engine\/[a-f0-9]{64}$/);
    return data;
  };
  const before = await manifest();
  const page = await get('/');
  assert.match(page.headers.get('content-type') || '', /text\/html/);
  const html = await page.text();
  const assets = [...new Set([...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map(match => match[1]).filter(path => path.startsWith('/_astro/') && /\.(css|js)(?:\?|$)/.test(path)))];
  assert.ok(assets.length > 0, 'No built page assets found.');
  for (const path of [...assets, `${before.enginePath}/main.wasm`, `${before.enginePath}/wasm_exec.js`]) {
    assert.ok((await (await get(path)).arrayBuffer()).byteLength > 0, `Empty asset: ${path}`);
  }
  for (const type of ['split-ticket', 'split-pass', 'split-icpass']) {
    const query = new URLSearchParams({ from: '東京', to: '品川', ...(type !== 'split-ticket' ? { months: '1' } : {}) });
    const response = await get(`/api/${type}?${query}`);
    assert.equal(response.headers.get('X-Deployment-Commit'), sha, `${type}: API SHA does not match.`);
    const data = await response.json();
    assert.ok(!data.error, `${type}: API returned an error.`);
    const validPath = path => Array.isArray(path) && path.length >= 2 && path.every(station => typeof station === 'string' && station.length > 0);
    assert.ok(validPath(data.normal), `${type}: invalid normal path.`);
    assert.ok(Array.isArray(data.results) && data.results.length > 0 && data.results.every(validPath), `${type}: invalid results.`);
  }
  const after = await manifest();
  assert.equal(after.enginePath, before.enginePath, 'Frontend changed during verification.');
}

export async function verifyWithRetry(options, { attempts = 5, sleep = delay } = {}) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await verifyStaging(options);
      return;
    } catch (error) {
      if (attempt === attempts) throw error;
      console.warn(`staging verification attempt ${attempt} failed: ${error.message}`);
      await sleep(10000);
    }
  }
  throw new Error('No staging verification attempts were made.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await verifyWithRetry({ sha: process.env.TARGET_SHA });
  console.log(`Staging verified: ${process.env.TARGET_SHA}`);
}
