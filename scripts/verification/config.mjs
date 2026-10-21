import { cases } from './cases.mjs';
export { cases };

export function config(environment) {
  if (!['production', 'staging'].includes(environment)) throw new Error('不正な検証環境');
  // トークンを送る接続先は、ファイルや応答から取得せず固定定義から選ぶ。
  return Object.freeze({ environment,
    publicUrl: environment === 'production' ? 'https://kippu-navi.com' : 'https://staging.kippu-navi.com',
    serviceUrl: environment === 'production'
      ? 'https://calculation-engine-198310540092.asia-northeast1.run.app'
      : 'https://calculation-engine-staging-198310540092.asia-northeast1.run.app',
    service: environment === 'production' ? 'calculation-engine' : 'calculation-engine-staging',
    project: 'bubbly-trail-470023-e4', region: 'asia-northeast1' });
}

export function trustedApiBase(base, authenticated = false) {
  for (const environment of ['production', 'staging']) {
    const c = config(environment);
    if (!authenticated && base === c.publicUrl) return c.publicUrl;
    if (base === c.serviceUrl) return c.serviceUrl;
  }
  throw new Error('検証APIの接続先が許可されていません');
}

export function selectCase(c) {
  const known = cases.find(candidate => candidate.kind === c?.kind && candidate.from === c?.from
    && candidate.to === c?.to && candidate.months === c?.months);
  if (!known) throw new Error('検証APIの入力が固定ケースと一致しません');
  return known;
}
export function queryFor(c) {
  const known = selectCase(c);
  return new URLSearchParams({ from: known.from, to: known.to, ...(known.months ? { months: String(known.months) } : {}) });
}
export function expectedJson(c) {
  const known = selectCase(c);
  return { normal: [known.from, known.to], results: [[known.from, known.to]] };
}
