import { createHash } from 'node:crypto';
import lineData from '../data/catalog/lines.json' with { type: 'json' };
import ticketSpecific from '../../calculation-engine/internal/ticket/infra/fareio/data/specificFares.json' with { type: 'json' };
import ticketAdjusted from '../../calculation-engine/internal/ticket/infra/fareio/data/adjustedFares.json' with { type: 'json' };
import passSpecific from '../../calculation-engine/internal/pass/infra/fareio/data/specificFares.json' with { type: 'json' };
import passAdjusted from '../../calculation-engine/internal/pass/infra/fareio/data/adjustedFares.json' with { type: 'json' };

export const kinds = { conventional: '在来線', shinkansen: '新幹線' };
type Transfer = { name: string; href: string };
// 駅順・距離程・路線の並びは、専用の手編集データをそのまま使用する。
export const catalogLines = lineData.map(line => ({ ...line, kind: line.kind as keyof typeof kinds, rows: line.rows.map(row => ({ ...row, transfers: [] as Transfer[] })) }));
export type CatalogLine = typeof catalogLines[number];
export const lineHref = (line: Pick<CatalogLine, 'name'>) => `/data/lines/${encodeURIComponent(line.name)}`;
const stationLines = new Map<string, Transfer[]>();
for (const line of catalogLines) line.rows.forEach((row, index) => {
  const list = stationLines.get(row.station) ?? [];
  list.push({ name: line.name, href: `${lineHref(line)}#station-${index + 1}` });
  stationLines.set(row.station, list);
});
for (const line of catalogLines) for (const row of line.rows) {
  row.transfers = (stationLines.get(row.station) ?? []).filter(target => target.name !== line.name);
}
const fareSourceFiles = ['ticket', 'pass'].flatMap(k => ['specificFares', 'adjustedFares'].map(n => `calculation-engine/internal/${k}/infra/fareio/data/${n}.json`));
export const publicationSources = ['ＪＲ時刻表 2025年10月号'];
export const specificFareSource = { title: 'JR東日本 旅客営業規則 別表第2号', url: 'https://www.jreast.co.jp/ryokaku/beppyou/pdf/beppyou02.pdf', scope: '乗車券の特定運賃' };
export const sourceFiles = ['src/data/catalog/lines.json', ...fareSourceFiles];
export const distances = catalogLines.flatMap(line => line.rows.map((row, index) => ({
  lineName: line.name, kind: line.kind, order: index + 1,
  station: row.station, kana: row.kana, classification: line.classification,
  transferLines: row.transfers.map(t => t.name), transferLinks: row.transfers.map(t => t.href), eigyoDeciKm: row.eigyoDeciKm, giseiDeciKm: row.giseiDeciKm,
})));
const pairLines = new Map<string, Set<string>>();
for (const line of catalogLines) for (let i = 1; i < line.rows.length; i++) {
  const key = JSON.stringify([line.rows[i - 1].station, line.rows[i].station].sort());
  const set = pairLines.get(key) ?? new Set<string>(); set.add(line.name); pairLines.set(key, set);
}
const pathLines = (path: string[]) => [...new Set(path.slice(1).flatMap((s, i) => [...(pairLines.get(JSON.stringify([path[i], s].sort())) ?? [])]))];
export const fareRecords = [
  { ticketType: '乗車券', category: '特定運賃', rows: ticketSpecific },
  { ticketType: '乗車券', category: '調整運賃', rows: ticketAdjusted },
  { ticketType: '定期券', category: '特定運賃', rows: passSpecific },
  { ticketType: '定期券', category: '調整運賃', rows: passAdjusted },
].flatMap(({ ticketType, category, rows }) => rows.map((r, index) => ({
  id: `${ticketType === '定期券' ? 'pass' : 'ticket'}-${category === '特定運賃' ? 'specific' : 'adjusted'}-${index}`,
  ticketType, category, lines: pathLines(r.path), from: r.path[0], to: r.path.at(-1)!, path: r.path,
  fare: typeof r.fare === 'number' ? r.fare : null,
  oneMonth: typeof r.fare === 'number' ? null : r.fare.OneMonth === 0 ? null : r.fare.OneMonth,
  threeMonth: typeof r.fare === 'number' ? null : r.fare.ThreeMonth === 0 ? null : r.fare.ThreeMonth,
  sixMonth: typeof r.fare === 'number' ? null : r.fare.SixMonth === 0 ? null : r.fare.SixMonth,
})));
export const revision = createHash('sha256').update(JSON.stringify([lineData, ticketSpecific, ticketAdjusted, passSpecific, passAdjusted, publicationSources, specificFareSource])).digest('hex');
export const km = (n: number | null) => n === null ? '—' : (n / 10).toFixed(1);
export const sourceUrl = (file: string) => `https://github.com/tojoryohei/kippu-navi/blob/main/${file}`;
export function downloadData(dataset: string) {
  const records = dataset === 'distances' ? distances : fareRecords;
  return { formatVersion: 12, revision, publications: publicationSources, references: dataset === 'special-fares' ? [specificFareSource] : [], distanceUnit: '0.1km', currency: 'JPY', records };
}
export function toCsv(records: Record<string, unknown>[]) {
  const keys = Object.keys(records[0] ?? {});
  const cell = (v: unknown) => {
    let s = v == null ? '' : Array.isArray(v) ? JSON.stringify(v) : String(v);
    if (typeof v === 'string' && /^[=+@\-\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [keys.map(cell).join(','), ...records.map(r => keys.map(k => cell(r[k])).join(','))].join('\r\n') + '\r\n';
}
