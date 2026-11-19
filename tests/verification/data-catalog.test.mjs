/* eslint-disable security/detect-non-literal-fs-filename, security/detect-object-injection -- 固定したリポジトリ原典と項目名のみを検証する */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fareCalculationHref } from '../../src/lib/fare-route-link.ts';
import { parseRoute } from '../../src/app/fare/lib/routeParser.ts';
import routeLines from '../../src/app/fare/data/lines.json' with { type: 'json' };
import routeStations from '../../src/app/fare/data/stations.json' with { type: 'json' };
import { catalogLines, distances, lineHref, fareRecords, downloadData, toCsv } from '../../src/lib/data-catalog.ts';
const read = path => JSON.parse(readFileSync(new URL(`../../calculation-engine/internal/${path}`, import.meta.url), 'utf8'));

test('各路線の駅名・URLに重複がなく、距離程は0から始まる', () => {
  for (const line of catalogLines) {
    assert.ok(['conventional', 'shinkansen'].includes(line.kind));
    assert.equal(line.rows.length, new Set(line.rows.map(r => r.station)).size, line.name);
    assert.ok(['幹線', '地方交通線'].includes(line.classification), line.name);
    assert.equal(line.rows[0].eigyoDeciKm, 0, line.name);
    assert.ok(line.rows[0].giseiDeciKm === null || line.rows[0].giseiDeciKm === 0, line.name);
  }
  assert.equal(new Set(catalogLines.map(l => l.name)).size, catalogLines.length);
  assert.equal(distances.length, catalogLines.reduce((n, l) => n + l.rows.length, 0));
  assert.ok(distances.every(row => !('administrativeCode' in row) && !('kanaCode' in row)));
});

test('東北本線は田端・王子経由、尾久支線と埼京線は独立した営業キロ程を持つ', () => {
  const main = catalogLines.find(l => l.name === '東北本線');
  assert.deepEqual(main.rows.slice(6, 13).map(r => [r.station, r.eigyoDeciKm]), [['日暮里', 58], ['西日暮里', 63], ['田端', 71], ['上中里', 88], ['王子', 99], ['東十条', 114], ['赤羽', 132]]);
  assert.equal(main.rows[0].eigyoDeciKm, 0);
  assert.equal(main.rows.find(r => r.station === '大宮').eigyoDeciKm, 303);
  assert.equal(main.rows.at(-1).eigyoDeciKm, 5353);
  assert.ok(!main.rows.some(r => r.station === '尾久'));
  const branch = catalogLines.find(l => l.name === '東北本線２');
  assert.deepEqual(branch.rows.map(r => [r.station, r.eigyoDeciKm]), [['日暮里', 0], ['尾久', 26], ['赤羽', 76]]);
  const saikyo = catalogLines.find(l => l.name === '東北本線４');
  assert.deepEqual([saikyo.rows[0].station, saikyo.rows[0].eigyoDeciKm], ['赤羽', 0]);
  assert.equal(saikyo.rows.find(r => r.station === '武蔵浦和').eigyoDeciKm, 106);
  assert.deepEqual([saikyo.rows.at(-1).station, saikyo.rows.at(-1).eigyoDeciKm], ['大宮', 180]);
});

test('東海道新幹線と山陽新幹線は新大阪を両端に持ち、相互に乗り換えられる', () => {
  const tokaido = catalogLines.find(l => l.name === '東海道新幹線');
  const sanyo = catalogLines.find(l => l.name === '山陽新幹線');
  assert.ok(tokaido && sanyo);
  assert.ok(!catalogLines.some(l => l.name === '東海道・山陽新幹線'));
  assert.deepEqual([tokaido.rows[0].station, tokaido.rows.at(-1).station], ['東京', '新大阪']);
  assert.deepEqual([sanyo.rows[0].station, sanyo.rows.at(-1).station], ['新大阪', '博多']);
  assert.equal(tokaido.rows.at(-1).eigyoDeciKm, 5526);
  assert.equal(sanyo.rows[0].eigyoDeciKm, 0);
  assert.equal(sanyo.rows[0].giseiDeciKm, 0);
  assert.equal(sanyo.rows.find(r => r.station === '新神戸').eigyoDeciKm, 369);
  assert.equal(sanyo.rows.at(-1).eigyoDeciKm, 6223);
  assert.ok(tokaido.rows.at(-1).transfers.some(t => t.name === sanyo.name));
  assert.ok(sanyo.rows[0].transfers.some(t => t.name === tokaido.name));
  assert.ok(!tokaido.rows.some(r => r.station === '博多'));
  assert.ok(!sanyo.rows.some(r => r.station === '東京'));
});

test('香椎線・筑豊本線・中央本線を接続し、筑肥線を二つに分け、留萌本線を掲載しない', () => {
  for (const [name, from, to, count, length] of [['香椎線', '西戸崎', '宇美', 16, 254], ['筑豊本線', '若松', '原田', 25, 661], ['中央本線', '東京', '名古屋', 108, 3969], ['筑肥線', '山本', '伊万里', 11, 257], ['筑肥線２', '姪浜', '唐津', 20, 426]]) {
    const line = catalogLines.find(l => l.name === name);
    assert.ok(line, name);
    assert.deepEqual([line.rows[0].station, line.rows.at(-1).station], [from, to]);
    assert.equal(line.rows.length, count);
    assert.equal(line.rows[0].eigyoDeciKm, 0);
    assert.equal(line.rows.at(-1).eigyoDeciKm, length);
  }
  assert.ok(!catalogLines.some(l => /留萌|中央東線|中央西線/.test(l.name)));
  const central = catalogLines.find(l => l.name === '中央本線');
  assert.equal(central.rows.find(r => r.station === '塩尻').eigyoDeciKm, 2221);
  assert.equal(central.rows.find(r => r.station === '（中）金山').eigyoDeciKm, 3936);
  assert.equal(catalogLines.find(l => l.name === '香椎線').rows.find(r => r.station === '香椎').eigyoDeciKm, 129);
  assert.equal(catalogLines.find(l => l.name === '筑豊本線').rows.find(r => r.station === '折尾').eigyoDeciKm, 108);
  assert.ok(!catalogLines.filter(l => l.name.startsWith('筑肥線')).some(l => l.rows.some(r => r.station === '鬼塚')));
});

test('継ぎ足し部分の二重掲載を整理しても主要路線の距離程がつながる', () => {
  for (const [name, end] of [['大阪環状線', 207], ['山手線', 206], ['奥羽本線', 4845], ['川越線', 306], ['関西本線', 1749], ['紀勢本線', 3842], ['山陽本線', 5344], ['上越線', 1626], ['常磐線', 3437], ['総武本線', 1205], ['筑豊本線', 661], ['中央本線', 3969], ['東海道本線', 5895], ['根室本線２', 3075], ['函館本線', 4231], ['室蘭本線', 2110], ['八高線', 920], ['予讃線', 2976]]) {
    const line = catalogLines.find(l => l.name === name);
    assert.equal(line.rows.at(-1).eigyoDeciKm, end, name);
    assert.ok(line.rows.every((r, i) => i === 0 || r.eigyoDeciKm > line.rows[i - 1].eigyoDeciKm), name);
  }
});

test('起点駅を0.0kmとし、未収録の換算キロと路線名URLを保つ', () => {
  const azuma = catalogLines.find(l => l.name === '吾妻線');
  assert.deepEqual(azuma.rows.slice(0, 3).map(r => [r.station, r.eigyoDeciKm, r.giseiDeciKm]), [['渋川', 0, 0], ['金島', 55, 61], ['祖母島', 77, 85]]);
  const hinka = catalogLines.find(l => l.name === '品鶴線');
  assert.equal(decodeURIComponent(lineHref(hinka)), '/data/lines/品鶴線');
  assert.equal(hinka.rows[0].station, '品川');
  assert.equal(hinka.rows[0].eigyoDeciKm, 0);
  assert.equal(hinka.rows[0].giseiDeciKm, null);
  assert.ok(distances.some(r => r.giseiDeciKm === null));
  assert.ok(!catalogLines.some(l => l.name === '横須賀線_品鶴線' || l.name === '青い森鉄道'));
});

test('乗換先は同じ駅のある公開JR路線の駅で、自路線・重複・無効リンクを含まない', () => {
  for (const line of catalogLines) for (const row of line.rows) {
    const expectedLines = catalogLines.filter(l => l.name !== line.name && l.rows.some(r => r.station === row.station));
    assert.deepEqual(row.transfers.map(t => t.name), expectedLines.map(l => l.name));
    assert.equal(new Set(row.transfers.map(t => t.name)).size, row.transfers.length);
    for (const target of row.transfers) {
      const destination = catalogLines.find(l => l.name === target.name);
      const index = Number(target.href.split('#station-')[1]) - 1;
      assert.equal(destination.rows[index].station, row.station);
      assert.equal(target.href, `${lineHref(destination)}#station-${index + 1}`);
    }
  }
  const shibukawa = catalogLines.find(l => l.name === '吾妻線').rows[0];
  assert.deepEqual(shibukawa.transfers.map(t => t.name), ['上越線']);
});

test('券種別の特定・調整運賃の全経路・有効な金額・件数が原典と一致し、未設定の定期運賃はnullになる', () => {
  let count = 0;
  for (const [kind, label] of [['ticket', '乗車券'], ['pass', '定期券']]) for (const [name, category] of [['specificFares', '特定運賃'], ['adjustedFares', '調整運賃']]) {
    const original = read(`${kind}/infra/fareio/data/${name}.json`);
    const rows = fareRecords.filter(r => r.ticketType === label && r.category === category);
    assert.equal(rows.length, original.length); count += original.length;
    rows.forEach((row, i) => {
      assert.deepEqual(row.path, original[i].path);
      assert.deepEqual(kind === 'ticket' ? row.fare : { OneMonth: row.oneMonth, ThreeMonth: row.threeMonth, SixMonth: row.sixMonth }, kind === 'ticket' ? original[i].fare : Object.fromEntries(Object.entries(original[i].fare).map(([period, value]) => [period, value === 0 ? null : value])));
    });
  }
  const toyohashi = fareRecords.find(r => r.from === '豊橋' && r.to === '愛知御津' && r.ticketType === '定期券' && r.category === '調整運賃');
  assert.deepEqual([toyohashi.oneMonth, toyohashi.threeMonth, toyohashi.sixMonth], [null, null, 28300]);
  assert.equal(count, fareRecords.length);
  assert.equal(new Set(fareRecords.map(r => r.id)).size, count);
});

test('JSONとCSVを全件往復して日本語・配列・金額・距離を検証する', () => {
  function parseCsv(text) {
    const rows = []; let row = [], value = '', quoted = false;
    const csv = text.replace(/^\uFEFF/, '');
    for (let i = 0; i < csv.length; i++) {
      const c = csv[i];
      if (c === '"') { if (quoted && csv[i + 1] === '"') { value += '"'; i++; } else quoted = !quoted; }
      else if (!quoted && (c === ',' || c === '\r')) { row.push(value); value = ''; if (c === '\r') { rows.push(row); row = []; i++; } }
      else value += c;
    }
    return rows;
  }
  for (const dataset of ['distances', 'special-fares']) {
    const data = JSON.parse(JSON.stringify(downloadData(dataset)));
    const csv = toCsv(data.records);
    assert.equal(csv.charCodeAt(0), 0xFEFF);
    const [header, ...rows] = parseCsv(csv);
    assert.equal(rows.length, data.records.length);
    rows.forEach((row, i) => header.forEach((key, j) => {
      const expected = data.records[i][key];
      assert.equal(row[j], expected === null ? '' : Array.isArray(expected) ? JSON.stringify(expected) : String(expected));
    }));
  }
  const [header, row] = parseCsv(toCsv([{ name: '=1+1', path: ['a,b', '"駅'] }]));
  assert.deepEqual(header, ['name', 'path']);
  assert.deepEqual(row, ["'=1+1", JSON.stringify(['a,b', '"駅'])]);
});

test('全特例運賃のリンクを運賃計算機で復元すると元の全駅経路と一致する', () => {
  for (const record of fareRecords) {
    const href = fareCalculationHref(record.path, record.ticketType);
    assert.ok(href.startsWith('/fare/'));
    const url = new URL(href, 'https://example.test');
    assert.equal(url.origin, 'https://example.test');
    assert.equal(url.pathname, record.ticketType === '定期券' ? '/fare/pass' : '/fare/ticket');
    const route = parseRoute(url.searchParams.get('route'), routeStations, routeLines);
    assert.ok(route);
    const restored = [route.startStation.name];
    for (const segment of route.segments) {
      assert.ok(segment.viaLine, record.id);
      const stations = segment.viaLine.stations;
      const start = stations.indexOf(restored.at(-1));
      const end = stations.indexOf(segment.destinationStation.name);
      assert.ok(start >= 0 && end >= 0, record.id);
      const middle = stations.slice(Math.min(start, end), Math.max(start, end) + 1);
      if (start > end) middle.reverse();
      restored.push(...middle.slice(1));
    }
    assert.deepEqual(restored, record.path, record.id);
  }
  assert.equal(new URL(fareCalculationHref(fareRecords[0].path, '乗車券'), 'https://example.test').searchParams.get('route'), '東京[総武]西船橋');
});
