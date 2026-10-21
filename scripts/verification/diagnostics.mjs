// 通信由来の文字列をそのまま保存しない。検証に必要な識別子だけを有限の文字集合で再構成する。
const hex = Object.freeze('0123456789abcdef'.split(''));
const uuid = Object.freeze('0123456789abcdefABCDEF-'.split(''));
const digits = Object.freeze('0123456789'.split(''));
const statuses = Object.freeze(Array.from({ length: 500 }, (_, index) => index + 100));
const counts = Object.freeze(Array.from({ length: 1001 }, (_, index) => index));

function identifier(value, pattern, alphabet) {
  if (typeof value !== 'string' || !pattern.test(value)) return '[invalid]';
  return Array.from(value, character => alphabet.find(allowed => allowed === character)).join('');
}
export function commitDiagnostic(value) {
  return value === null || value === undefined ? null : identifier(value, /^[a-f0-9]{40}$/, hex);
}
export function enginePathDiagnostic(value) {
  if (typeof value !== 'string' || !/^\/engine\/[a-f0-9]{64}$/.test(value)) return '[invalid]';
  return `/engine/${identifier(value.slice(8), /^[a-f0-9]{64}$/, hex)}`;
}
export function requestIdDiagnostic(value) {
  return value === null ? null : identifier(value, /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, uuid);
}
export function statusDiagnostic(value) { return statuses.find(status => status === value) ?? null; }
export function cacheDiagnostic(value) {
  return ['HIT', 'MISS', 'BYPASS', 'DYNAMIC', 'EXPIRED', 'STALE', 'UPDATING', 'REVALIDATED'].find(status => status === value) ?? null;
}
export function ageDiagnostic(value) { return value === null ? null : identifier(value, /^[0-9]{1,10}$/, digits); }

function count(value) { return counts.find(allowed => allowed === value) ?? 'over_limit'; }
function type(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'object') return 'object';
  return 'missing';
}
function path(value, fixture) {
  if (!Array.isArray(value)) return { type: type(value) };
  return { length: count(value.length), stations: value.slice(0, 8).map(station => {
    if (station === fixture.from) return fixture.from;
    if (station === fixture.to) return fixture.to;
    return { type: type(station), unexpected: true };
  }), truncated: value.length > 8 };
}
export function jsonDiagnostic(value, fixture) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { type: type(value) };
  return { normal: path(value.normal, fixture), results: Array.isArray(value.results)
    ? { length: count(value.results.length), paths: value.results.slice(0, 8).map(result => path(result, fixture)), truncated: value.results.length > 8 }
    : { type: type(value.results) }, unexpectedKeyCount: count(Object.keys(value).filter(key => key !== 'normal' && key !== 'results').length) };
}
export function manifestDiagnostic(value) {
  return { environment: ['production', 'staging'].find(environment => environment === value?.environment) ?? '[invalid]',
    commit: commitDiagnostic(value?.commit), enginePath: enginePathDiagnostic(value?.enginePath) };
}
